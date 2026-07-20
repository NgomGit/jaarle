-- Palier Gold : la 2e déclinaison n'est plus générée automatiquement (coût économisé si le
-- client se satisfait de la 1ère). `layout` mémorise le gabarit de la 1ère variation pour que
-- la déclinaison à la demande force le gabarit opposé (garantit une vraie différence visuelle).
-- À exécuter après 0011_gold_tier.sql.

alter table public.creations
  add column if not exists layout text;
