-- ─────────────────────────────────────────────────────────────────────────────
-- 0024 — Image des services au choix + commandes du panier (à exécuter après 0023)
--
-- 1. Services : le vendeur choisit l'image affichée (products.display_media)
--    • 'poster' (par défaut) : l'affiche — ex. coiffure à domicile, où la photo envoyée montre la
--      personne elle-même ;
--    • 'photos' : les photos — ex. location de voitures, appartements.
--    Si l'image choisie n'existe pas encore, on montre l'autre : un service n'est plus caché du
--    Market faute d'affiche, il suffit qu'il ait une affiche OU une photo.
--    Les produits restent toujours affichés avec leur 1re photo.
--
-- 2. shop_orders : chaque envoi de panier sur WhatsApp crée une commande avec un code court.
--    Le message WhatsApp contient le lien /recu/{code} (récapitulatif avec photos, quantités,
--    total). Les lignes sont une copie figée au moment de la commande (nom, prix, photo).
--    Écriture uniquement côté serveur (service_role) ; le vendeur lit les commandes de sa boutique.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Choix de l'image d'un service ────────────────────────────────────────────
alter table public.products add column if not exists display_media text not null default 'poster';
alter table public.products drop constraint if exists products_display_media_check;
alter table public.products add constraint products_display_media_check check (display_media in ('poster', 'photos'));

-- Image affichée d'une fiche (interne) : chemin de photo, ou « poster:<clé> » pour une affiche.
create or replace function public.product_media(p_product uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.subject_type = 'service' and p.display_media = 'photos'
      then coalesce(ph.path, 'poster:' || public.product_poster_key(p.id)::text)
    when p.subject_type = 'service'
      then coalesce('poster:' || public.product_poster_key(p.id)::text, ph.path)
    else ph.path
  end
  from public.products p
  left join lateral (
    select i.path from public.product_images i where i.product_id = p.id order by i.position limit 1
  ) ph on true
  where p.id = p_product;
$$;
revoke all on function public.product_media(uuid) from public, anon, authenticated;
grant execute on function public.product_media(uuid) to service_role;

-- Visible sur le Market = a une image affichable (le 2e argument est gardé pour la compatibilité).
create or replace function public.market_item_visible(p_product uuid, p_subject_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.product_media(p_product) is not null;
$$;
revoke all on function public.market_item_visible(uuid, text) from public, anon, authenticated;
grant execute on function public.market_item_visible(uuid, text) to service_role;

-- Produits et services du Market : image_path OU poster_key selon le choix du vendeur.
create or replace function public.market_products(
  p_categories text[] default null,
  p_city text default null,
  p_shop uuid default null,
  p_q text default null,
  p_min integer default null,
  p_max integer default null,
  p_sort text default 'relevance',
  p_limit integer default 24,
  p_offset integer default 0,
  p_type text default null
)
returns table (
  id uuid, slug text, name text, price integer, status text, market_category text, subject_type text,
  created_at timestamptz, image_path text, poster_key uuid,
  shop_id uuid, shop_slug text, shop_name text, shop_city text, shop_district text, shop_logo_path text,
  shop_whatsapp text, shop_phone text,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with elig as (select m.shop_id from public.market_shop_ids() m),
  q as (
    select nullif(replace(replace(replace(btrim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_'), '') as term
  ),
  base as (
    select p.id, p.slug, p.name, p.price, p.status, p.market_category, p.subject_type, p.created_at, p.updated_at,
           public.product_media(p.id) as media,
           s.id as shop_id, s.slug as shop_slug, s.name as shop_name, s.city as shop_city,
           s.district as shop_district, s.logo_path as shop_logo_path,
           s.whatsapp as shop_whatsapp, s.phone as shop_phone
    from public.products p
    join public.shops s on s.id = p.shop_id
    cross join q
    where p.shop_id in (select e.shop_id from elig e)
      and p.status in ('active', 'sold_out')
      and (p_type is null or p.subject_type = p_type)
      and (p_categories is null or p.market_category = any(p_categories))
      and (p_city is null or public.market_norm(s.city) = p_city)
      and (p_shop is null or p.shop_id = p_shop)
      and (p_min is null or p.price >= p_min)
      and (p_max is null or p.price <= p_max)
      and (q.term is null
           or p.name ilike '%' || q.term || '%'
           or p.description ilike '%' || q.term || '%'
           or p.category ilike '%' || q.term || '%'
           or s.name ilike '%' || q.term || '%')
  )
  select b.id, b.slug, b.name, b.price, b.status, b.market_category, b.subject_type, b.created_at,
         case when b.media like 'poster:%' then null else b.media end as image_path,
         case when b.media like 'poster:%' then substr(b.media, 8)::uuid end as poster_key,
         b.shop_id, b.shop_slug, b.shop_name, b.shop_city, b.shop_district, b.shop_logo_path,
         b.shop_whatsapp, b.shop_phone,
         count(*) over () as total_count
  from base b
  where b.media is not null
  order by
    (case when p_sort = 'price_asc' then b.price end) asc nulls last,
    (case when p_sort = 'price_desc' then b.price end) desc nulls last,
    (b.status = 'sold_out') asc,
    (case when p_sort = 'new' then b.created_at end) desc nulls last,
    b.updated_at desc,
    b.id
  limit least(greatest(coalesce(p_limit, 24), 1), 60)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.market_products(text[], text, uuid, text, integer, integer, text, integer, integer, text) from public;
grant execute on function public.market_products(text[], text, uuid, text, integer, integer, text, integer, integer, text) to anon, authenticated, service_role;

-- Vignettes des boutiques : même règle.
create or replace function public.market_thumbs(p_shop uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array(
    select t.thumb from (
      select public.product_media(p.id) as thumb, p.position, p.created_at
      from public.products p
      where p.shop_id = p_shop and p.status = 'active'
    ) t
    where t.thumb is not null
    order by t.position, t.created_at desc
    limit 3
  );
$$;
revoke all on function public.market_thumbs(uuid) from public, anon, authenticated;
grant execute on function public.market_thumbs(uuid) to service_role;

-- Statut Market du vendeur : « services sans affiche » = services réglés sur l'affiche qui n'en
-- ont pas encore (ils s'affichent avec leur photo en attendant).
create or replace function public.my_market_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shop public.shops%rowtype;
  v_pro boolean;
  v_ready integer;
  v_uncategorized integer;
  v_no_poster integer;
begin
  if auth.uid() is null then return null; end if;
  select * into v_shop from public.shops where owner_id = auth.uid() limit 1;
  if v_shop.id is null then return null; end if;
  select exists (
    select 1 from public.subscriptions sub
    where sub.user_id = auth.uid() and sub.status = 'active' and sub.plan_key <> 'free'
      and sub.starts_at <= now() and sub.ends_at > now()
  ) into v_pro;
  select count(*) into v_ready from public.products p
  where p.shop_id = v_shop.id and p.status in ('active', 'sold_out') and public.market_item_visible(p.id, p.subject_type);
  select count(*) into v_uncategorized from public.products p
  where p.shop_id = v_shop.id and p.status in ('active', 'sold_out') and p.market_category is null;
  select count(*) into v_no_poster from public.products p
  where p.shop_id = v_shop.id and p.status in ('active', 'sold_out') and p.subject_type = 'service'
    and p.display_media = 'poster' and public.product_poster_key(p.id) is null;
  return jsonb_build_object(
    'published', v_shop.status = 'published',
    'eligible_industry', coalesce(v_shop.industry in ('fashion', 'beauty', 'grocery', 'agriculture', 'poissonnerie', 'furniture', 'electronics', 'artisanat',
                                                       'services', 'events', 'restaurant', 'real-estate'), false),
    'pro', v_pro,
    'products_with_photo', v_ready,
    'uncategorized', v_uncategorized,
    'services_without_poster', v_no_poster,
    'listed', v_shop.id in (select m.shop_id from public.market_shop_ids() m)
  );
end;
$$;
revoke all on function public.my_market_status() from public, anon;
grant execute on function public.my_market_status() to authenticated, service_role;

-- 2. Commandes du panier ─────────────────────────────────────────────────────
create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  shop_id uuid not null references public.shops(id) on delete cascade,
  -- [{ "product_id", "slug", "name", "options", "qty", "unit_price", "image_path" }]
  items jsonb not null,
  item_count integer not null,
  total integer not null default 0,
  has_unpriced boolean not null default false,
  source text,
  visitor_hash text,
  created_at timestamptz not null default now(),
  constraint shop_orders_code_format check (code ~ '^[A-Z2-9]{8}$'),
  constraint shop_orders_items_array check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 20),
  constraint shop_orders_item_count check (item_count between 1 and 400),
  constraint shop_orders_total check (total >= 0),
  constraint shop_orders_source_length check (source is null or char_length(source) <= 16),
  constraint shop_orders_visitor_length check (visitor_hash is null or char_length(visitor_hash) <= 64)
);
create index if not exists shop_orders_shop_time_idx on public.shop_orders(shop_id, created_at desc);
create index if not exists shop_orders_visitor_time_idx on public.shop_orders(visitor_hash, created_at desc);

alter table public.shop_orders enable row level security;

-- Lecture : le propriétaire de la boutique (futur onglet « Commandes »). Aucune policy d'écriture :
-- les commandes sont créées par le serveur (service_role), le reçu public est lu par le serveur.
drop policy if exists "shop_orders_select_own" on public.shop_orders;
create policy "shop_orders_select_own"
  on public.shop_orders for select
  to authenticated
  using (exists (select 1 from public.shops s where s.id = shop_orders.shop_id and s.owner_id = auth.uid()));

revoke all on public.shop_orders from anon;
grant select on public.shop_orders to authenticated;
grant all on public.shop_orders to service_role;
