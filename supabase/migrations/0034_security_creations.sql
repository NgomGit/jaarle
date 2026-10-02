-- ─────────────────────────────────────────────────────────────────────────────
-- 0034 — Sécurité des affiches (audit du 2026-10-02, à exécuter après 0033)
--
-- 1. Les affiches nettes ({uid}/…-poster.jpg, …-poster-2.jpg) ne sont plus lisibles depuis le
--    navigateur : seul le serveur les lit (aperçus filigranés, /affiche, Studio) et les écrit.
--    Les photos et logos envoyés par le vendeur restent lisibles par lui.
-- 2. creations / creation_versions : plus aucune écriture depuis le navigateur (insert / update).
--    Avant : un compte gratuit pouvait créer une ligne « unlocked = true » ou remettre ses
--    compteurs de régénération à zéro. Les routes du serveur écrivent avec la clé service_role
--    après leurs vérifications. La suppression de ses propres créations reste permise.
--    Toute policy UPDATE / INSERT / ALL ajoutée à la main sur ces tables est supprimée, et un
--    trigger refuse ces écritures pour un utilisateur final même si une policy revenait.
-- 3. Bucket « creations » : 15 Mo maximum par fichier, images uniquement.
-- Migration rejouable.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Stockage : affiches réservées au serveur ──────────────────────────────────
drop policy if exists "creation_photos_select_own" on storage.objects;
create policy "creation_photos_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'creations'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name !~ '-poster(-2)?\.jpg$'
  );

drop policy if exists "creation_photos_insert_own" on storage.objects;
create policy "creation_photos_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'creations'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name !~ '-poster(-2)?\.jpg$'
  );

update storage.buckets
   set file_size_limit = 15728640,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
 where id = 'creations';

-- 2. Tables : écritures réservées au serveur ───────────────────────────────────
drop policy if exists "creations_insert_own" on public.creations;
drop policy if exists "creation_versions_insert_own" on public.creation_versions;

do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('creations', 'creation_versions')
      and cmd in ('UPDATE', 'INSERT', 'ALL')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- Garde-fou : un utilisateur final ne peut ni créer de ligne, ni en modifier le contenu. Seule
-- exception : la remise à null de product_id / shop_id faite par les clés étrangères quand le
-- vendeur supprime une fiche ou sa boutique (ON DELETE SET NULL).
create or replace function public.creations_server_only_write()
returns trigger
language plpgsql
as $$
begin
  if public.billing_is_end_user() then
    if tg_op = 'INSERT'
       or (to_jsonb(new) - 'product_id' - 'shop_id' - 'updated_at') is distinct from (to_jsonb(old) - 'product_id' - 'shop_id' - 'updated_at')
       or ((to_jsonb(new) ->> 'product_id') is not null and (to_jsonb(new) ->> 'product_id') is distinct from (to_jsonb(old) ->> 'product_id'))
       or ((to_jsonb(new) ->> 'shop_id') is not null and (to_jsonb(new) ->> 'shop_id') is distinct from (to_jsonb(old) ->> 'shop_id'))
    then
      raise exception 'Écriture réservée au serveur Jaarle (%).', tg_table_name using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists creations_server_only_write on public.creations;
create trigger creations_server_only_write
  before insert or update on public.creations
  for each row execute function public.creations_server_only_write();

drop trigger if exists creation_versions_server_only_write on public.creation_versions;
create trigger creation_versions_server_only_write
  before insert or update on public.creation_versions
  for each row execute function public.creations_server_only_write();
