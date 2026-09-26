// Règles d'accès et garde-fous de coût du Studio (partagées client / serveur).

/**
 * Textes des publications : copiables même si l'affiche n'est pas encore débloquée (ils donnent
 * envie de publier ; le visuel propre, lui, reste payant). Passer à `true` pour exiger le déblocage.
 */
export const STUDIO_TEXTS_REQUIRE_UNLOCK = false;

/** Nombre maximum de générations complètes (packs) par commerçant sur 24 h. */
export const STUDIO_MAX_PACKS_PER_DAY = 20;

/** Nombre maximum de régénérations d'une même plateforme. */
export const STUDIO_MAX_REGENERATIONS_PER_POST = 5;
