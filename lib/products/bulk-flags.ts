// Import en lot (Bulk Upload) — phase pilote (décision du 2026-10-12) : d'abord sur le seul compte
// de Mouhamed, puis ouvert aux formules Pro et Business.
//  - BULK_UPLOAD_PUBLIC : false = seuls les testeurs ont l'écran d'import ; les autres Pro/Business
//    voient « Bientôt ». Passer à true pour ouvrir à toutes les formules qui l'incluent.
//  - Testeurs : BULK_UPLOAD_TESTERS_DEFAULT (compte de Mouhamed) + la variable d'environnement
//    BULK_UPLOAD_TESTERS (identifiants Supabase, e-mails ou numéros, séparés par des virgules).
// Un testeur doit tout de même avoir une formule qui inclut l'import (Pro ou Business).

export const BULK_UPLOAD_PUBLIC = true;
export const BULK_UPLOAD_TESTERS_DEFAULT = ["776524579"];

function testers(): string[] {
  return [...BULK_UPLOAD_TESTERS_DEFAULT, ...(process.env.BULK_UPLOAD_TESTERS ?? "").split(",")]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** 9 derniers chiffres d'un numéro (77 123 45 67, +221771234567 et 221771234567 sont égaux). */
function phoneKey(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : null;
}

/** L'écran d'import est-il ouvert pour cet utilisateur (indépendamment de sa formule) ? */
export function isBulkUploadOpen(user: { id: string; email?: string | null; phone?: string | null } | null | undefined): boolean {
  if (!user) return false;
  if (BULK_UPLOAD_PUBLIC) return true;
  const list = testers();
  if (list.includes(user.id.toLowerCase())) return true;
  if (user.email && list.includes(user.email.toLowerCase())) return true;
  const p = phoneKey(user.phone);
  return !!p && list.some((t) => phoneKey(t) === p);
}
