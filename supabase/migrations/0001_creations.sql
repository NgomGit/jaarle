-- Table des créations (affiches) + bucket de stockage des photos produit.
-- À exécuter une fois dans le SQL Editor du dashboard Supabase (Project > SQL Editor).

create table if not exists public.creations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_name text not null,
  price integer not null,
  style text not null,
  photo_path text not null,
  created_at timestamptz not null default now()
);

alter table public.creations enable row level security;

create policy "creations_select_own"
  on public.creations for select
  to authenticated
  using (auth.uid() = user_id);

create policy "creations_insert_own"
  on public.creations for insert
  to authenticated
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('creations', 'creations', false)
on conflict (id) do nothing;

create policy "creation_photos_insert_own"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'creations' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "creation_photos_select_own"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'creations' and (storage.foldername(name))[1] = auth.uid()::text);
