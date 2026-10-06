-- 0038 — Boutiques en ligne par défaut (2026-10-06)
-- Beaucoup de vendeurs oubliaient l'étape « Publier ». Désormais createShop crée la boutique
-- directement en 'published' ; une boutique vide affiche « Les produits arrivent bientôt »,
-- reste en noindex (isShopIndexable) et n'apparaît pas sur le Market (seuil d'annonces).
--
-- Rattrapage : on publie les brouillons qui n'ont JAMAIS été publiés (published_at null).
-- Ceux qui ont déjà été en ligne puis mis hors ligne volontairement ne sont pas touchés.
-- Le trigger existant renseigne published_at.

update public.shops
set status = 'published'
where status = 'draft'
  and published_at is null;

