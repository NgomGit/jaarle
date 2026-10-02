import type { MetadataRoute } from "next";

// Manifest de la PWA (installation sur l'écran d'accueil). L'app installée s'ouvre sur le
// tableau de bord du vendeur. `id` fixe : changer start_url plus tard ne crée pas une 2e app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "Jaarle — Ta boutique, tes affiches et tes publications",
    short_name: "Jaarle",
    description: "Boutique en ligne gratuite, affiches IA et publications réseaux pour les commerçants du Sénégal.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FAFAFA",
    theme_color: "#6D5EF5",
    lang: "fr-SN",
    dir: "ltr",
    categories: ["business", "shopping", "productivity"],
    prefer_related_applications: false,
    icons: [
      { src: "/images/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/images/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/images/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/images/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Ajouter un produit", short_name: "Nouveau produit", url: "/dashboard/produits/nouveau", icons: [{ src: "/images/icon-192.png", sizes: "192x192" }] },
      { name: "Créer une affiche", short_name: "Affiche", url: "/dashboard/new", icons: [{ src: "/images/icon-192.png", sizes: "192x192" }] },
      { name: "Ma boutique", short_name: "Boutique", url: "/dashboard/boutique", icons: [{ src: "/images/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
