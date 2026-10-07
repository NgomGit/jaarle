-- ─────────────────────────────────────────────────────────────────────────────
-- 0040 — Affiches multi-photos V2 (2026-10-07, à exécuter après 0039)
--
-- 1. creations : version du pipeline ('v1' par défaut : rien ne change pour les créations
--    existantes), design complet de l'affiche V2 (analyse, direction, scène, rendu) et chemin de
--    la scène sans texte (pour re-rendre une autre mise en page sans appel IA).
-- 2. creation_versions : chaque version garde son design et sa scène.
-- 3. Stockage : la scène ({uid}/…-poster-scene.jpg) est réservée au serveur, comme les affiches
--    nettes (0034) — c'est un visuel sans filigrane.
-- Écritures toujours réservées au serveur (0034). Migration rejouable.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.creations
  add column if not exists pipeline_version text not null default 'v1',
  add column if not exists design jsonb,
  add column if not exists scene_path text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'creations_pipeline_version_check') then
    alter table public.creations
      add constraint creations_pipeline_version_check check (pipeline_version in ('v1', 'v2'));
  end if;
end $$;

alter table public.creation_versions
  add column if not exists design jsonb,
  add column if not exists scene_path text;

-- Rotation des mises en page : dernières affiches V2 d'un vendeur.
create index if not exists creations_user_v2_idx
  on public.creations (user_id, created_at desc)
  where pipeline_version = 'v2';

-- Stockage : affiches ET scènes réservées au serveur.
drop policy if exists "creation_photos_select_own" on storage.objects;
create policy "creation_photos_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'creations'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name !~ '-poster(-2|-scene)?\.jpg$'
  );

drop policy if exists "creation_photos_insert_own" on storage.objects;
create policy "creation_photos_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'creations'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name !~ '-poster(-2|-scene)?\.jpg$'
  );
