-- ─────────────────────────────────────────────────────────────────────────────
-- 0035 — Vidéo produit (V1) — à exécuter après 0034
--
-- • Une vidéo maximum par produit (table product_videos, product_id UNIQUE), 30 s maximum.
--   La vidéo est découpée et compressée dans le navigateur (MP4 H.264/AAC 720p) puis envoyée
--   directement à Supabase Storage (upload résumable TUS) : elle ne transite pas par Next.js.
-- • Bucket PUBLIC dédié « product-videos » (30 Mo, video/mp4 uniquement), mêmes règles de dossier
--   que shop-media ({user_id}/videos/…). On ne relève pas la limite de shop-media (5 Mo, images) :
--   ses policies permettent l'envoi direct depuis le navigateur, ce qui ouvrirait 30 Mo aux images.
-- • L'image d'aperçu (poster) de la vidéo va dans shop-media ({user_id}/videos/{uuid}.webp).
-- • Visibilité publique = exactement celle des photos (product_images) : produit actif/épuisé
--   d'une boutique publiée. Brouillon, masqué, supprimé ou boutique suspendue → invisible.
-- • Événement de statistiques « product_video_play ».
-- Migration rejouable.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Table ───────────────────────────────────────────────────────────────────
create table if not exists public.product_videos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, -- dénormalisé pour une RLS simple
  path text not null,              -- bucket product-videos : {owner_id}/videos/{uuid}.mp4
  poster_path text,                -- bucket shop-media : {owner_id}/videos/{uuid}.webp
  duration_ms integer not null,
  file_size integer not null,
  mime_type text not null default 'video/mp4',
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_videos_one_per_product unique (product_id),
  constraint product_videos_path_format check (
    path ~ '^[0-9a-f-]{36}/videos/[0-9a-f-]{36}\.mp4$' and split_part(path, '/', 1) = owner_id::text
  ),
  constraint product_videos_poster_format check (
    poster_path is null
    or (poster_path ~ '^[0-9a-f-]{36}/videos/[0-9a-f-]{36}\.webp$' and split_part(poster_path, '/', 1) = owner_id::text)
  ),
  -- 30 s + une marge d'une demi-seconde (l'encodeur peut finir sur la frame suivante).
  constraint product_videos_duration check (duration_ms between 300 and 30500),
  constraint product_videos_size check (file_size between 1 and 31457280),
  constraint product_videos_mime check (mime_type = 'video/mp4'),
  constraint product_videos_dims check (
    (width is null or width between 16 and 1920) and (height is null or height between 16 and 1920)
  )
);

create index if not exists product_videos_owner_idx on public.product_videos(owner_id);

drop trigger if exists product_videos_set_updated_at on public.product_videos;
create trigger product_videos_set_updated_at
  before update on public.product_videos
  for each row execute function public.set_updated_at();

-- Garde-fou (y compris pour la clé service_role) : owner_id = propriétaire du produit.
create or replace function public.product_videos_check_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.products p where p.id = new.product_id and p.owner_id = new.owner_id) then
    raise exception 'product_videos.owner_id doit correspondre au propriétaire du produit'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists product_videos_check_owner on public.product_videos;
create trigger product_videos_check_owner
  before insert or update of product_id, owner_id on public.product_videos
  for each row execute function public.product_videos_check_owner();

-- 2. RLS ─────────────────────────────────────────────────────────────────────
alter table public.product_videos enable row level security;

drop policy if exists "product_videos_select_own" on public.product_videos;
create policy "product_videos_select_own"
  on public.product_videos for select
  to authenticated
  using (owner_id = auth.uid());

-- Même règle que product_images_select_public (0015).
drop policy if exists "product_videos_select_public" on public.product_videos;
create policy "product_videos_select_public"
  on public.product_videos for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.products p
      join public.shops s on s.id = p.shop_id
      where p.id = product_videos.product_id
        and p.status in ('active', 'sold_out')
        and s.status = 'published'
    )
  );

-- Écriture : son produit, et jamais quand la boutique est suspendue (comme products_insert_own).
drop policy if exists "product_videos_insert_own" on public.product_videos;
create policy "product_videos_insert_own"
  on public.product_videos for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.products p join public.shops s on s.id = p.shop_id
      where p.id = product_videos.product_id and p.owner_id = auth.uid() and s.status <> 'suspended'
    )
  );

drop policy if exists "product_videos_update_own" on public.product_videos;
create policy "product_videos_update_own"
  on public.product_videos for update
  to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.products p join public.shops s on s.id = p.shop_id
      where p.id = product_videos.product_id and p.owner_id = auth.uid() and s.status <> 'suspended'
    )
  );

drop policy if exists "product_videos_delete_own" on public.product_videos;
create policy "product_videos_delete_own"
  on public.product_videos for delete
  to authenticated
  using (owner_id = auth.uid());

-- 3. Bucket public « product-videos » ────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-videos', 'product-videos', true, 31457280, array['video/mp4'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Pas de policy SELECT pour anon (comme shop-media) : les URL publiques fonctionnent sans,
-- et le contenu du bucket ne peut pas être listé.
drop policy if exists "product_videos_obj_select_own" on storage.objects;
create policy "product_videos_obj_select_own"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'product-videos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "product_videos_obj_insert_own" on storage.objects;
create policy "product_videos_obj_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ '^[0-9a-f-]{36}/videos/[0-9a-f-]{36}\.mp4$'
  );

drop policy if exists "product_videos_obj_update_own" on storage.objects;
create policy "product_videos_obj_update_own"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-videos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'product-videos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "product_videos_obj_delete_own" on storage.objects;
create policy "product_videos_obj_delete_own"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-videos' and (storage.foldername(name))[1] = auth.uid()::text);

-- 4. Statistiques : lecture d'une vidéo produit ───────────────────────────────
alter table public.shop_events drop constraint if exists shop_events_type_check;
alter table public.shop_events add constraint shop_events_type_check check (type in (
  'shop_view', 'product_view', 'whatsapp_click', 'share_click', 'qr_scan', 'order_click', 'call_click',
  'product_video_play'
));
