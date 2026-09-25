// Validation des formulaires boutique (partagée client / server actions).
import { z } from "zod";
import { SLUG_MAX, SLUG_MIN, validateSlug } from "@/lib/shops/slug";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const ShopInputSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit faire au moins 2 caractères.").max(60, "60 caractères maximum."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(SLUG_MIN)
    .max(SLUG_MAX)
    .refine((s) => validateSlug(s) === null, "Lien invalide."),
  industry: optionalText(40),
  categoryLabel: optionalText(80),
  // 9 chiffres locaux (le champ PhoneInput ajoute +221), converti en E.164 côté serveur.
  whatsapp: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 9, "Numéro WhatsApp : 9 chiffres (ex. 77 123 45 67)."),
  city: optionalText(60),
  district: optionalText(60),
  description: optionalText(500),
  logoPath: z.string().max(300).nullable().optional(),
});

export type ShopInput = z.input<typeof ShopInputSchema>;
export type ShopInputParsed = z.output<typeof ShopInputSchema>;
