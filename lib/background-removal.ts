/**
 * Détourage pixel-exact du produit via remove.bg, pour garantir que le produit
 * livré au client n'est jamais redessiné par un modèle génératif.
 */
export async function removeBackground(photoBuffer: Buffer): Promise<Buffer> {
  const apiKey = process.env.REMOVEBG_API_KEY;
  if (!apiKey) {
    throw new Error("REMOVEBG_API_KEY manquant.");
  }

  const res = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ image_file_b64: photoBuffer.toString("base64"), size: "auto", format: "png" }),
  });

  if (!res.ok) {
    throw new Error(`remove.bg a échoué : ${res.status} ${await res.text()}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
