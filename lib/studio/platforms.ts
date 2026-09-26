// Spécifications des plateformes du Studio Marketing : format du visuel, longueur et ton du texte.
// Utilisable côté client et serveur.

export type StudioPlatform = "instagram_feed" | "facebook" | "tiktok" | "instagram_story" | "whatsapp_status";
export type StudioFormat = "square" | "story";

export interface PlatformSpec {
  key: StudioPlatform;
  label: string;
  shortLabel: string;
  format: StudioFormat;
  width: number;
  height: number;
  captionMax: number; // longueur max de la légende générée (caractères)
  hashtags: [number, number]; // min / max
  guidance: string; // consigne de ton et de structure envoyée à l'IA
}

export const PLATFORMS: PlatformSpec[] = [
  {
    key: "instagram_feed",
    label: "Instagram — publication",
    shortLabel: "Instagram",
    format: "square",
    width: 1080,
    height: 1080,
    captionMax: 900,
    hashtags: [8, 12],
    guidance:
      "Publication Instagram (fil). 2 à 4 paragraphes courts séparés par une ligne vide. Première ligne = accroche forte (elle est tronquée dans le fil). Emojis avec modération (3 maximum). Terminer par un appel à l'action vers WhatsApp (« lien en bio » ou numéro). Les hashtags vont dans le champ hashtags, PAS dans la légende.",
  },
  {
    key: "facebook",
    label: "Facebook — publication",
    shortLabel: "Facebook",
    format: "square",
    width: 1080,
    height: 1080,
    captionMax: 1200,
    hashtags: [2, 4],
    guidance:
      "Publication Facebook. Ton conversationnel et chaleureux, comme un commerçant qui parle à sa communauté. 3 à 6 phrases, peut inclure une courte liste à puces. Donner explicitement le moyen de commander (numéro WhatsApp et lien de la boutique fournis dans les faits). Peu d'emojis. Hashtags dans le champ hashtags uniquement.",
  },
  {
    key: "tiktok",
    label: "TikTok — vidéo / photo",
    shortLabel: "TikTok",
    format: "story",
    width: 1080,
    height: 1920,
    captionMax: 150,
    hashtags: [3, 5],
    guidance:
      "Légende TikTok : UNE accroche très courte et directe (150 caractères maximum), ton jeune et dynamique, sans liste. Donner envie de venir en message ou sur la boutique (lien en bio). Hashtags dans le champ hashtags.",
  },
  {
    key: "instagram_story",
    label: "Instagram — story",
    shortLabel: "Story",
    format: "story",
    width: 1080,
    height: 1920,
    captionMax: 120,
    hashtags: [0, 2],
    guidance:
      "Story Instagram : pas de légende classique. La « caption » est le texte court à superposer ou à mettre en sticker (120 caractères maximum), direct et incitatif. Le CTA doit convenir à un sticker lien / message (ex. « Écris-nous pour commander »).",
  },
  {
    key: "whatsapp_status",
    label: "WhatsApp — statut",
    shortLabel: "Statut WhatsApp",
    format: "story",
    width: 1080,
    height: 1920,
    captionMax: 250,
    hashtags: [0, 0],
    guidance:
      "Statut WhatsApp : texte court et personnel (250 caractères maximum), comme un message à ses contacts. Mentionner le prix s'il est fourni. Le CTA invite à répondre au statut pour commander (ex. « Réponds à ce statut pour commander »). AUCUN hashtag (inutiles sur WhatsApp).",
  },
];

export const PLATFORM_BY_KEY = Object.fromEntries(PLATFORMS.map((p) => [p.key, p])) as Record<StudioPlatform, PlatformSpec>;

export const FORMAT_SIZE: Record<StudioFormat, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
};
