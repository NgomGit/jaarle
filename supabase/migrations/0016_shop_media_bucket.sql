-- Jaarle 2.0 — Phase 0 : bucket PUBLIC pour les images des boutiques (logos, bannières, photos produit).
-- Le bucket privé `creations` reste inchangé : il protège les affiches non payées (aperçu filigrané).
-- Convention de chemin : {user_id}/shops/… et {user_id}/products/… — le 1er segment = auth.uid(),
-- comme pour le bucket `creations`.
-- Script idempotent. À exécuter après 0015_shops_products.sql.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-media', 'shop-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Pas de policy SELECT pour `anon` : les URL publiques d'un bucket public fonctionnent sans,
-- et cela empêche de lister le contenu du bucket via l'API.
drop policy if exists "shop_media_select_own" on storage.objects;
create policy "shop_media_select_own"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'shop-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "shop_media_insert_own" on storage.objects;
create policy "shop_media_insert_own"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'shop-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "shop_media_update_own" on storage.objects;
create policy "shop_media_update_own"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'shop-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'shop-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "shop_media_delete_own" on storage.objects;
create policy "shop_media_delete_own"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'shop-media' and (storage.foldername(name))[1] = auth.uid()::text);
