import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jaarle — Ta boutique, tes affiches et tes publications",
    short_name: "Jaarle",
    description: "Boutique en ligne gratuite, affiches IA et publications réseaux pour les commerçants du Sénégal.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#FAFAFA",
    theme_color: "#6D5EF5",
    lang: "fr-SN",
    icons: [
      { src: "/images/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/images/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
