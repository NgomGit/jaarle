import { randomInt } from "crypto";
import type { User } from "@supabase/supabase-js";

// Réinitialisation du mot de passe par l'admin (serveur uniquement).
// Le drapeau vit dans app_metadata : l'utilisateur ne peut pas le modifier lui-même.

/** Numéro WhatsApp du support Jaarle (même que le bouton flottant). */
export const JAARLE_SUPPORT_WHATSAPP = "221771350203";

export const MIN_PASSWORD_LENGTH = 6;

/** L'utilisateur doit choisir un nouveau mot de passe avant d'utiliser Jaarle. */
export function mustChangePassword(user: Pick<User, "app_metadata"> | null | undefined): boolean {
  return user?.app_metadata?.must_change_password === true;
}

// Sans caractères ambigus (0/O, 1/I/l) : le mot de passe est dicté ou recopié depuis WhatsApp.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Mot de passe provisoire lisible, ex. « JRL-7KQ4-M9TA » (12 caractères aléatoires utiles : 8). */
export function generateTemporaryPassword(): string {
  const pick = (n: number) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `JRL-${pick(4)}-${pick(4)}`;
}
