// Validation des produits (partagée client / server actions).
import { z } from "zod";
import { isMarketLeaf } from "@/lib/market/categories";

export const PRODUCT_STATUSES = ["draft", "active", "sold_out", "hidden"] as const;

const OptionSchema = z.object({
  name: z.string().trim().min(1).max(30),
  values: z.array(z.string().trim().min(1).max(30)).min(1).max(20),
});

const ImageSchema = z.object({
  path: z.string().min(1).max(300),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
});

export const ProductInputSchema = z.object({
  subjectType: z.enum(["product", "service"]).default("product"),
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
  options: z.array(OptionSchema).max(3).default([]),
  status: z.enum(PRODUCT_STATUSES).default("active"),
  images: z.array(ImageSchema).max(4, "4 photos maximum."),
  aiSuggestions: z.record(z.string(), z.unknown()).nullable().optional(),
  sourceCreationId: z.string().uuid().nullable().optional(),
});

export type ProductInput = z.input<typeof ProductInputSchema>;
