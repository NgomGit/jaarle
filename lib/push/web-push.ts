import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from "crypto";

// Web Push sans dépendance (Node crypto) : chiffrement du message (RFC 8291, aes128gcm) et
// signature VAPID (RFC 8292). Clés au même format que la librairie « web-push » :
// publique = point P-256 non compressé (65 octets), privée = scalaire d (32 octets), en base64url.

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string; // clé publique du navigateur (base64url)
  auth: string; // secret d'authentification (base64url)
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string; // mailto:… ou https://…
}

export class PushError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
  /** L'abonnement n'existe plus (désinstallé, permission retirée) : à supprimer. */
  get gone(): boolean {
    return this.statusCode === 404 || this.statusCode === 410;
  }
}

const b64url = (buf: Buffer) => buf.toString("base64url");
const fromB64url = (s: string) => Buffer.from(s, "base64url");

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  return Buffer.from(hkdfSync("sha256", ikm, salt, info, length));
}

/** Corps chiffré aes128gcm (un seul enregistrement) pour l'abonnement donné. */
export function encryptPayload(payload: Buffer, sub: Pick<PushSubscriptionKeys, "p256dh" | "auth">): Buffer {
  const uaPublic = fromB64url(sub.p256dh);
  const authSecret = fromB64url(sub.auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error("Clés d'abonnement invalides");

  const ecdh = createECDH("prime256v1");
  const asPublic = ecdh.generateKeys();
  const sharedSecret = ecdh.computeSecret(uaPublic);
  const salt = randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, sharedSecret, keyInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  // 0x02 : délimiteur du dernier (et seul) enregistrement.
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096);
  return Buffer.concat([salt, recordSize, Buffer.from([asPublic.length]), asPublic, encrypted]);
}

/** En-tête Authorization VAPID pour l'origine du service push. */
export function vapidAuthorization(endpoint: string, vapid: VapidKeys, expiresInSeconds = 12 * 3600): string {
  const pub = fromB64url(vapid.publicKey);
  const d = fromB64url(vapid.privateKey);
  if (pub.length !== 65 || d.length !== 32) throw new Error("Clés VAPID invalides");
  const key = createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: b64url(d), x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)) },
    format: "jwk",
  });
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(
    Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + expiresInSeconds, sub: vapid.subject }))
  );
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${vapid.publicKey}`;
}

/** Envoie un message chiffré. Lève PushError si le service push refuse. */
export async function sendWebPush(
  sub: PushSubscriptionKeys,
  payload: string,
  vapid: VapidKeys,
  options: { ttl?: number; urgency?: "very-low" | "low" | "normal" | "high"; topic?: string; timeoutMs?: number } = {}
): Promise<void> {
  const body = encryptPayload(Buffer.from(payload, "utf8"), sub);
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Content-Encoding": "aes128gcm",
    TTL: String(options.ttl ?? 24 * 3600),
    Urgency: options.urgency ?? "normal",
    Authorization: vapidAuthorization(sub.endpoint, vapid),
  };
  // Topic : un message plus récent avec le même sujet remplace celui pas encore livré.
  if (options.topic) headers.Topic = options.topic.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers,
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
  });
  if (res.status >= 200 && res.status < 300) return;
  const text = await res.text().catch(() => "");
  throw new PushError(`Service push ${res.status}: ${text.slice(0, 200)}`, res.status);
}
