// Formats de sortie des visuels (colonne creations.format, migration 0015).
// Référence pour la suite : le pipeline actuel produit toujours du 1024×1024 (= "square") et
// n'est PAS modifié à ce stade. Le paramétrage des tailles dans lib/poster-pipeline.ts,
// app/api/render-overlay et lib/image-compose.ts se fera dans une étape dédiée, sans changer
// le comportement du format "square".

export type CreationFormat = "square" | "story" | "landscape";

export interface FormatSpec {
  key: CreationFormat;
  label: string;
  width: number;
  height: number;
  usage: string;
}

export const FORMATS: Record<CreationFormat, FormatSpec> = {
  square: { key: "square", label: "Carré 1:1", width: 1024, height: 1024, usage: "Post Facebook / Instagram, WhatsApp" },
  story: { key: "story", label: "Story 9:16", width: 1080, height: 1920, usage: "Statut WhatsApp, story Instagram / Facebook, TikTok" },
  landscape: { key: "landscape", label: "Paysage 1,91:1", width: 1200, height: 630, usage: "Lien partagé, bannière, publicité" },
};

export const DEFAULT_FORMAT: CreationFormat = "square";
