// Génère les images d'exemple utilisées dans la démo interactive de la landing page
// (section "Style" — components/site/app-preview.tsx). Usage :
//   node --env-file=.env.local scripts/generate-style-previews.mjs
//
// Étape 1 : génère une photo produit de base (robe wax bleue) par text-to-image.
// Étape 2 : décline cette photo dans les 6 styles du produit via image-to-image,
//           avec les mêmes prompts de style que app/api/generate-creation/route.ts.
import { writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "public", "images", "styles");

const STYLES = [
  { key: "premium", direction: "dégradé violet profond et élégant, éclairage studio dramatique" },
  { key: "moderne", direction: "dégradé vert émeraude épuré, ambiance moderne et fraîche" },
  { key: "luxe", direction: "dégradé doré et ambré, ambiance luxe premium" },
  { key: "promo", direction: "dégradé rouge énergique, ambiance promotionnelle dynamique" },
  { key: "minimal", direction: "fond gris foncé neutre et minimaliste, très épuré" },
  { key: "event", direction: "dégradé bleu profond festif, ambiance événementielle élégante" },
];

async function callOpenRouterImages(body) {
  const res = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("Aucune image renvoyée.");
  return b64;
}

async function main() {
  await import("node:fs/promises").then((fs) => fs.mkdir(OUT_DIR, { recursive: true }));

  console.log("Génération de la photo produit de base…");
  const baseB64 = await callOpenRouterImages({
    model: "openai/gpt-image-1",
    prompt:
      "Photographie produit professionnelle d'une robe africaine en wax bleu, sur mannequin buste ou à plat, fond neutre clair, éclairage studio doux, style catalogue e-commerce haut de gamme, aucune personne visible.",
    quality: "medium",
    size: "1024x1024",
  });
  await writeFile(path.join(OUT_DIR, "base-product.png"), Buffer.from(baseB64, "base64"));
  console.log("  → base-product.png sauvegardée");

  for (const style of STYLES) {
    console.log(`Génération du style "${style.key}"…`);
    const styledB64 = await callOpenRouterImages({
      model: "openai/gpt-image-1",
      prompt: `Transforme cette photo de robe wax bleue en affiche publicitaire de style "${style.key}" pour le marché sénégalais : ${style.direction}. Garde le vêtement reconnaissable et fidèle à la photo originale. Ajoute un arrière-plan et une mise en page professionnelle, sans texte incrusté.`,
      input_references: [{ type: "image_url", image_url: { url: `data:image/png;base64,${baseB64}` } }],
      quality: "medium",
      size: "1024x1024",
    });
    await writeFile(path.join(OUT_DIR, `${style.key}.png`), Buffer.from(styledB64, "base64"));
    console.log(`  → ${style.key}.png sauvegardée`);
  }

  console.log("Terminé.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
