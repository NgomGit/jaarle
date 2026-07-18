-- Bascule le paiement : la génération devient gratuite et immédiate, le paiement
-- ne débloque plus qu'après coup le téléchargement d'une création existante.
-- À exécuter après 0003_orders.sql.

alter table public.creations
  add column if not exists unlocked boolean not null default false;

-- Les commandes se rattachent maintenant à une création déjà existante plutôt que
-- de porter les infos nécessaires pour en générer une — ces colonnes deviennent inutiles
-- pour les nouvelles commandes, on les rend juste optionnelles (pas de perte de données).
alter table public.orders alter column photo_path drop not null;
alter table public.orders alter column product_name drop not null;
alter table public.orders alter column price drop not null;
alter table public.orders alter column style drop not null;
