import crypto from "crypto";

// PayTech ajoute ~2% de frais visibles par le client par-dessus le item_price envoyé (confirmé
// empiriquement : envoyer 100 fait apparaître "102" côté client dans son appli mobile money).
// Aucun paramètre API ni réglage de compte trouvé pour changer ce comportement (vérifié dans la
// doc officielle). On envoie donc un montant légèrement réduit qui, une fois les ~2% de PayTech
// ajoutés, retombe exactement sur le prix affiché sur Jaarle — le FCFA n'a pas de sous-unité,
// donc l'arrondi retombe pile. Jaarle absorbe la différence plutôt que de surprendre le client
// avec un montant plus élevé que celui annoncé.
const PAYTECH_FEE_RATE = 0.02;

export function withoutPaytechFee(targetAmount: number): number {
  return Math.floor(targetAmount / (1 + PAYTECH_FEE_RATE));
}

export interface PaytechRequestPaymentParams {
  itemName: string;
  itemPrice: number;
  refCommand: string;
  commandName: string;
  successUrl: string;
  cancelUrl: string;
  ipnUrl: string;
  customField?: Record<string, unknown>;
}

interface PaytechResponse {
  success: number;
  token?: string;
  redirect_url?: string;
  redirectUrl?: string;
}

export async function requestPaytechPayment(params: PaytechRequestPaymentParams): Promise<string> {
  const res = await fetch("https://paytech.sn/api/payment/request-payment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      API_KEY: process.env.PAYTECH_API_KEY!,
      API_SECRET: process.env.PAYTECH_API_SECRET!,
    },
    body: JSON.stringify({
      item_name: params.itemName,
      item_price: params.itemPrice,
      currency: "XOF",
      ref_command: params.refCommand,
      command_name: params.commandName,
      env: "prod",
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      ipn_url: params.ipnUrl,
      custom_field: params.customField ? JSON.stringify(params.customField) : undefined,
    }),
  });

  if (!res.ok) {
    throw new Error(`PayTech request-payment failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as PaytechResponse;
  const redirectUrl = data.redirect_url || data.redirectUrl;
  if (data.success !== 1 || !redirectUrl) {
    throw new Error("PayTech n'a pas renvoyé d'URL de paiement.");
  }
  return redirectUrl;
}

/**
 * Vérifie l'authenticité d'une notification IPN PayTech via HMAC-SHA256.
 * message = item_price|ref_command|api_key, signé avec api_secret.
 */
export function verifyPaytechIpn({
  itemPrice,
  refCommand,
  hmacCompute,
}: {
  itemPrice: number | string;
  refCommand: string;
  hmacCompute: string;
}): boolean {
  const apiKey = process.env.PAYTECH_API_KEY!;
  const apiSecret = process.env.PAYTECH_API_SECRET!;
  const message = `${itemPrice}|${refCommand}|${apiKey}`;
  const expected = crypto.createHmac("sha256", apiSecret).update(message).digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(hmacCompute || "", "hex");
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}
