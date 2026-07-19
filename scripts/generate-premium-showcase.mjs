// Génère des exemples de créations Premium réelles (via le vrai pipeline de production, pas un
// script séparé) pour la vitrine de la landing page (components/site/premium-showcase.tsx).
// Usage : npx tsx scripts/generate-premium-showcase.mjs
import { readFileSync, writeFileSync } from "fs";
import { buildPosterBackground, renderFinalPoster } from "../lib/poster-pipeline.ts";

for (const line of readFileSync("./.env.local", "utf-8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const OUT_DIR = "./public/images/premium-examples";

const EXAMPLES = [
  { file: "example-1.jpg", productName: "Robe wax bleue", price: 32500, industry: "fashion", businessName: null },
  { file: "example-2.jpg", productName: "Robe wax bleue", price: 32500, industry: "fashion", businessName: "Awa Créations" },
  { file: "example-3.jpg", productName: "Robe wax bleue", price: 32500, industry: "events", businessName: null },
];

async function main() {
  const photoBuffer = readFileSync("./public/images/styles/base-product.png");
  const photoBase64 = photoBuffer.toString("base64");

  for (const ex of EXAMPLES) {
    console.log(`Generating ${ex.file}...`);
    const bg = await buildPosterBackground(photoBuffer, photoBase64, "image/png", ex.productName, ex.industry, "premium");
    const result = await renderFinalPoster("http://localhost:3000", bg.backgroundBuffer, {
      tier: "premium",
      layout: bg.layout,
      productName: ex.productName,
      price: ex.price,
      phone: "+221776524579",
      industry: ex.industry,
      accentGradient: bg.accentGradient,
      businessName: ex.businessName,
      logoBuffer: null,
    });
    writeFileSync(`${OUT_DIR}/${ex.file}`, result.finalBuffer);
    console.log(`  -> ${ex.file} (${result.finalBuffer.length} bytes, usedAiTemplate=${result.usedAiTemplate})`);
  }

  console.log("DONE");
}

main().catch((err) => {
  console.error("FAILED", err);
  process.exit(1);
});
