-- Commandes de paiement PayTech pour débloquer une génération de création.
-- À exécuter une fois dans le SQL Editor du dashboard Supabase, après 0001 et 0002.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ref_command text not null unique,
  amount integer not null,
  status text not null default 'pending', -- pending | paid | canceled | failed
  payment_method text,
  photo_path text not null,
  product_name text not null,
  price integer not null,
  style text not null,
  industry text,
  language text not null default 'fr',
  creation_id uuid references public.creations(id),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

alter table public.orders enable row level security;

create policy "orders_select_own"
  on public.orders for select
  to authenticated
  using (auth.uid() = user_id);

create policy "orders_insert_own"
  on public.orders for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Pas de policy update pour les utilisateurs : seul le webhook IPN (via la clé
-- service_role, qui contourne la RLS) peut faire passer une commande à "paid",
-- et seulement après vérification de la signature PayTech côté serveur.
