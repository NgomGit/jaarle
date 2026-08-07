-- Historique multi-versions des affiches : une création peut désormais conserver plusieurs
-- versions d'affiche (variante principale, déclinaison, régénérations successives) au lieu des
-- 2 emplacements fixes poster_path / poster_path_2. Toutes les versions restent consultables
-- (carrousel de détail). poster_path / poster_path_2 restent renseignés pour rétro-compat et
-- servent d'aperçu "courant".
-- À exécuter après 0013_show_secondary_photos.sql (SQL Editor du dashboard Supabase).

create table if not exists public.creation_versions (
  id uuid primary key default gen_random_uuid(),
  creation_id uuid not null references public.creations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  poster_path text not null,
  kind text not null default 'regeneration'
    check (kind in ('principale', 'declinaison', 'regeneration')),
  created_at timestamptz not null default now()
);

create index if not exists creation_versions_creation_idx
  on public.creation_versions(creation_id, created_at);

alter table public.creation_versions enable row level security;

create policy "creation_versions_select_own"
  on public.creation_versions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "creation_versions_insert_own"
  on public.creation_versions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "creation_versions_delete_own"
  on public.creation_versions for delete
  to authenticated
  using (auth.uid() = user_id);

-- Backfill : on historise les affiches déjà générées (variante principale puis déclinaison),
-- de façon idempotente (ne réinsère pas si la version existe déjà).
insert into public.creation_versions (creation_id, user_id, poster_path, kind, created_at)
select c.id, c.user_id, c.poster_path, 'principale', c.created_at
from public.creations c
where c.poster_path is not null
  and not exists (
    select 1 from public.creation_versions v
    where v.creation_id = c.id and v.poster_path = c.poster_path
  );

insert into public.creation_versions (creation_id, user_id, poster_path, kind, created_at)
select c.id, c.user_id, c.poster_path_2, 'declinaison', c.created_at
from public.creations c
where c.poster_path_2 is not null
  and not exists (
    select 1 from public.creation_versions v
    where v.creation_id = c.id and v.poster_path = c.poster_path_2
  );
