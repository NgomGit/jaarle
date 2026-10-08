// Validation des produits (partagée client / server actions).
import { z } from "@/lib/zod-locale";
import { OPTION_VALUE_MAX, OPTION_VALUES_MAX } from "@/lib/shops/product-options";
import { isMarketLeaf } from "@/lib/market/categories";
import { MAX_VIDEO_BYTES, MAX_VIDEO_MS_DB } from "@/lib/shops/video";

export const PRODUCT_STATUSES = ["draft", "active", "sold_out", "hidden"] as const;

const OptionSchema = z.object({
  name: z.string().trim().min(1, "Donne un nom à chaque option.").max(30, "Nom d'option : 30 caractères maximum."),
  values: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(OPTION_VALUE_MAX, `Option : un choix dépasse ${OPTION_VALUE_MAX} caractères. Sépare les choix par des virgules (ex. Vert, Rose, Noir).`)
    )
    .min(1, "Ajoute au moins un choix à chaque option.")
    .max(OPTION_VALUES_MAX, `Option : ${OPTION_VALUES_MAX} choix maximum.`),
});

const ImageSchema = z.object({
  path: z.string().min(1).max(300),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
});

// Vidéo déjà envoyée dans le bucket product-videos (le chemin est revérifié côté serveur).
const VideoSchema = z.object({
  path: z.string().min(1).max(300),
  posterPath: z.string().min(1).max(300).nullable(),
  durationMs: z.number().int().min(300).max(MAX_VIDEO_MS_DB, "Vidéo trop longue (30 secondes maximum)."),
  fileSize: z.number().int().positive().max(MAX_VIDEO_BYTES, "Vidéo trop lourde (30 Mo maximum)."),
  width: z.number().int().min(16).max(1920).nullable(),
  height: z.number().int().min(16).max(1920).nullable(),
});

export const ProductInputSchema = z.object({
  subjectType: z.enum(["product", "service"]).default("product"),
  // Service : image affichée en vitrine et sur le Market (l'affiche ou les photos).
  displayMedia: z.enum(["poster", "photos"]).default("poster"),
  name: z.string().trim().min(1, "Donne un nom à ton produit.").max(120, "120 caractères maximum."),
  // null = « Prix sur demande »
  price: z.number().int().min(0, "Prix invalide.").max(100_000_000, "Prix invalide.").nullable(),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v ? v : null)),
  category: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => (v ? v : null)),
  // Catégorie Jaarle Market : clé d'une feuille de l'arbre (lib/market/categories.ts), ou vide.
  marketCategory: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v && isMarketLeaf(v) ? v : null)),
  // Promo (0046) : ancien prix barré + fin facultative (AAAA-MM-JJ). undefined = inchangée.
  compareAtPrice: z.number().int().min(1).max(100_000_000).nullable().optional(),
  promoEndsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date de fin invalide.")
    .nullable()
    .optional(),
  options: z.array(OptionSchema).max(3, "3 options maximum.").default([]),
  status: z.enum(PRODUCT_STATUSES).default("active"),
  images: z.array(ImageSchema).max(4, "4 photos maximum."),
  // undefined = vidéo inchangée (imports, appels sans formulaire) ; null = aucune vidéo / suppression.
  video: VideoSchema.nullable().optional(),
  aiSuggestions: z.record(z.string(), z.unknown()).nullable().optional(),
  sourceCreationId: z.string().uuid().nullable().optional(),
});

export type ProductInput = z.input<typeof ProductInputSchema>;
