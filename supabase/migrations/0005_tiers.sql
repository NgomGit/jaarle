-- Paliers de qualité (Basique / Medium / Premium) + régénérations incluses pour le Premium.
-- À exécuter après 0004_pay_to_unlock.sql.

alter table public.creations
  add column if not exists tier text not null default 'basic',
  add column if not exists regenerations_used integer not null default 0;

alter table public.orders
  add column if not exists tier text not null default 'basic';
