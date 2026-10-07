// Drapeau de la V2 multi-photos (2026-10-07) : phase de test sur des comptes choisis avant
// l'ouverture aux offres payantes.
//  - POSTER_V2_MULTI : interrupteur général (false = personne n'a la V2, la V1 reste intacte).
//  - Testeurs : variable d'environnement POSTER_V2_TESTERS (e-mails ou identifiants Supabase,
//    séparés par des virgules). Sans testeur listé, personne n'a la V2.
// Pour un testeur, le formulaire accepte 1 à 3 photos et la génération passe par la V2 dès qu'il
// y a 2 photos ou plus, quelle que soit son offre. Les autres comptes ne voient aucun changement.

export const POSTER_V2_MULTI = true;

export function posterV2Testers(): string[] {
  return (process.env.POSTER_V2_TESTERS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isPosterV2User(user: { id: string; email?: string | null } | null | undefined): boolean {
  if (!POSTER_V2_MULTI || !user) return false;
  const list = posterV2Testers();
  return list.includes(user.id.toLowerCase()) || (!!user.email && list.includes(user.email.toLowerCase()));
}
