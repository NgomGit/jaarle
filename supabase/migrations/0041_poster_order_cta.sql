-- Affiches d'annonce (événement, baptême, mariage…) : le vendeur peut retirer le bouton
-- « Commander sur WhatsApp ». false = pas de bouton, pas de « Prix sur devis », numéro facultatif.
-- Les « Nouvelle version » reprennent ce choix. Rejouable.
alter table public.creations
  add column if not exists show_order_cta boolean not null default true;
