// Drapeau de la V2 multi-photos (2026-10-07) : phase de test sur des comptes choisis avant
// l'ouverture aux offres payantes.
//  - POSTER_V2_MULTI : interrupteur général (false = personne n'a la V2, la V1 reste intacte).
//  - Testeurs : POSTER_V2_TESTERS_DEFAULT ci-dessous (compte de Mouhamed), plus ceux listés dans la
//    variable d'environnement POSTER_V2_TESTERS (identifiants Supabase, e-mails ou numéros de
//    téléphone, séparés par des virgules — la connexion Jaarle se fait par téléphone).
// Pour un testeur, le formulaire accepte 1 à 3 photos et la génération passe par la V2 dès qu'il
// y a 2 photos ou plus, quelle que soit son offre. Les autres comptes ne voient aucun changement.

export const POSTER_V2_MULTI = true;
/** Testeurs fixes (aucune configuration nécessaire, en local comme sur Vercel). */
export const POSTER_V2_TESTERS_DEFAULT = ["776524579"];
/** Les administrateurs ne sont PAS testeurs d'office (décision du 2026-10-07 : un seul compte). */
export const POSTER_V2_ADMINS = false;

export function posterV2Testers(): string[] {
  return [...POSTER_V2_TESTERS_DEFAULT, ...(process.env.POSTER_V2_TESTERS ?? "").split(",")]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** 9 derniers chiffres d'un numéro (77 123 45 67, +221771234567 et 221771234567 sont égaux). */
function phoneKey(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : null;
}

export function isPosterV2User(
  user: { id: string; email?: string | null; phone?: string | null } | null | undefined,
  entitlements?: { isAdmin?: boolean } | null
): boolean {
  if (!POSTER_V2_MULTI || !user) return false;
  if (POSTER_V2_ADMINS && entitlements?.isAdmin) return true;
  const list = posterV2Testers();
  if (list.includes(user.id.toLowerCase())) return true;
  if (user.email && list.includes(user.email.toLowerCase())) return true;
  const p = phoneKey(user.phone);
  return !!p && list.some((t) => phoneKey(t) === p);
}
