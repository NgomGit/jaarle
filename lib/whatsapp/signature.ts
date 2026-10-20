import { createHmac, timingSafeEqual } from "node:crypto";

// Côté serveur uniquement (webhook) : séparé de verification.ts, qui est aussi importé par la
// carte du tableau de bord (composant navigateur) — node:crypto y casserait le build.

/** Vérifie l'en-tête X-Hub-Signature-256 (« sha256=<hex> ») calculé avec l'App Secret Meta sur le corps brut. */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const [algo, sig] = header.split("=", 2);
  if (algo !== "sha256" || !sig || !/^[0-9a-f]{64}$/i.test(sig)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const given = Buffer.from(sig, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
