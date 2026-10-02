-- ─────────────────────────────────────────────────────────────────────────────
-- 0032 — Annonces choisies par l'admin (à exécuter après 0031)
--
-- Une boutique sous le seuil d'entrée (moins de launch_min_items annonces visibles, 6 par défaut)
-- n'est pas sur le Market. L'admin peut désormais y faire entrer une à une certaines de ses
-- annonces (page /dashboard/admin/market, « Annonces choisies »).
-- • market_product_picks : les annonces choisies (écriture service_role seulement, le vendeur
--   ne peut pas se choisir lui-même) ;
-- • market_pick_ids() : les choix qui s'appliquent — boutique publiée, secteur ouvert, PAS déjà
--   sur le Market, moins de launch_min_items annonces visibles, annonce visible et en ligne ;
-- • market_products() et market_counts() montrent ces annonces en plus. La boutique elle-même
--   n'entre pas dans la liste des boutiques (market_shops / annuaire) ;
-- • admin_market_pick_candidates() : la liste affichée dans l'admin.
-- Dès que la boutique atteint le seuil, toutes ses annonces entrent et les choix ne servent plus ;
-- ils restent enregistrés (utiles si elle repasse sous le seuil).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Choix de l'admin
create table if not exists public.market_product_picks (
  product_id uuid primary key references public.products(id) on delete cascade,
  picked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
-- Aucune policy : lecture / écriture par le serveur (service_role) uniquement.
alter table public.market_product_picks enable row level security;

-- 2. Boutiques sous le seuil (publiées, secteur ouvert, pas sur le Market) et leur nombre d'annonces visibles
create or replace function public.market_below_threshold_shops()
returns table (shop_id uuid, visible_items bigint, min_items integer)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select coalesce((select ms.launch_min_items from public.market_settings ms where ms.id), 6) as min_items
  ),
  cand as (
    select s.id,
           (select count(*) from public.products p
            where p.shop_id = s.id and p.status in ('active', 'sold_out')
              and public.market_item_visible(p.id, p.subject_type)) as n
    from public.shops s
    where s.status = 'published'
      and (s.industry is null or s.industry not in ('pharmacy', 'hotel', 'travel'))
      and s.id not in (select m.shop_id from public.market_shop_ids() m)
  )
  select c.id, c.n, cfg.min_items
  from cand c cross join cfg
  where c.n < cfg.min_items;
$$;
revoke all on function public.market_below_threshold_shops() from public, anon, authenticated;
grant execute on function public.market_below_threshold_shops() to service_role;

-- 3. Annonces choisies qui s'appliquent
create or replace function public.market_pick_ids()
returns table (product_id uuid, shop_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.shop_id
  from public.market_product_picks k
  join public.products p on p.id = k.product_id
  join public.market_below_threshold_shops() b on b.shop_id = p.shop_id
  where p.status in ('active', 'sold_out')
    and public.market_item_visible(p.id, p.subject_type);
$$;
revoke all on function public.market_pick_ids() from public, anon, authenticated;
grant execute on function public.market_pick_ids() to service_role;

-- 4. Produits et services du Market : + les annonces choisies
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
  p_type text default null,
  p_available boolean default null,
  p_q_categories text[] default null
)
returns table (
  id uuid, slug text, name text, price integer, status text, market_category text, subject_type text,
  created_at timestamptz, image_path text, poster_key uuid,
  shop_id uuid, shop_slug text, shop_name text, shop_city text, shop_district text, shop_logo_path text,
  shop_whatsapp text, shop_phone text,
  is_pro boolean, boosted boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with elig as (select m.shop_id, m.is_pro from public.market_shop_ids() m),
  picks as (select k.product_id from public.market_pick_ids() k),
  q as (
    select nullif(replace(replace(replace(btrim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_'), '') as term
  ),
  base as (
    select p.id, p.slug, p.name, p.price, p.status, p.market_category, p.subject_type, p.created_at, p.updated_at,
           public.product_media(p.id) as media,
           s.id as shop_id, s.slug as shop_slug, s.name as shop_name, s.city as shop_city,
           s.district as shop_district, s.logo_path as shop_logo_path,
           s.whatsapp as shop_whatsapp, s.phone as shop_phone,
           coalesce(e.is_pro, false) as is_pro
    from public.products p
    join public.shops s on s.id = p.shop_id
    left join elig e on e.shop_id = p.shop_id
    cross join q
    where p.status in ('active', 'sold_out')
      -- Boutique sur le Market, ou annonce choisie par l'admin (boutique sous le seuil).
      and (e.shop_id is not null or p.id in (select k.product_id from picks k))
      and (p_type is null or p.subject_type = p_type)
      and (p_categories is null or p.market_category = any(p_categories))
      and (p_city is null or public.market_norm(s.city) = p_city)
      and (p_shop is null or p.shop_id = p_shop)
      and (p_min is null or p.price >= p_min)
      and (p_max is null or p.price <= p_max)
      and (not coalesce(p_available, false) or p.status = 'active')
      and (q.term is null
           or p.name ilike '%' || q.term || '%'
           or p.description ilike '%' || q.term || '%'
           or p.category ilike '%' || q.term || '%'
           or s.name ilike '%' || q.term || '%'
           or s.city ilike '%' || q.term || '%'
           or s.district ilike '%' || q.term || '%'
           or (p_q_categories is not null and p.market_category = any(p_q_categories)))
  ),
  ranked as (
    select b.*,
           (b.is_pro and public.market_item_boosted(b.id, b.shop_id, b.market_category, b.shop_city)) as boosted,
           -- Rang de l'annonce dans sa boutique : sert à alterner les boutiques en tête de liste.
           row_number() over (partition by b.shop_id order by (b.status = 'sold_out'), b.updated_at desc, b.id) as shop_rank
    from base b
    where b.media is not null
  )
  select r.id, r.slug, r.name, r.price, r.status, r.market_category, r.subject_type, r.created_at,
         case when r.media like 'poster:%' then null else r.media end as image_path,
         case when r.media like 'poster:%' then substr(r.media, 8)::uuid end as poster_key,
         r.shop_id, r.shop_slug, r.shop_name, r.shop_city, r.shop_district, r.shop_logo_path,
         r.shop_whatsapp, r.shop_phone,
         r.is_pro, r.boosted,
         count(*) over () as total_count
  from ranked r
  order by
    (case when p_sort = 'price_asc' then r.price end) asc nulls last,
    (case when p_sort = 'price_desc' then r.price end) desc nulls last,
    (case when coalesce(p_sort, 'relevance') not in ('price_asc', 'price_desc', 'new') then r.boosted end) desc nulls last,
    (r.status = 'sold_out') asc,
    (case when p_sort = 'new' then r.created_at end) desc nulls last,
    (case when coalesce(p_sort, 'relevance') not in ('price_asc', 'price_desc', 'new')
          then r.shop_rank + (case when r.is_pro then 0 else 3 end) end) asc nulls last,
    r.is_pro desc,
    r.updated_at desc,
    r.id
  limit least(greatest(coalesce(p_limit, 24), 1), 60)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.market_products(text[], text, uuid, text, integer, integer, text, integer, integer, text, boolean, text[]) from public;
grant execute on function public.market_products(text[], text, uuid, text, integer, integer, text, integer, integer, text, boolean, text[]) to anon, authenticated, service_role;

-- 5. Compteurs (catégories × villes) : + les annonces choisies
create or replace function public.market_counts()
returns table (market_category text, city text, products bigint, shop_ids uuid[], min_price integer)
language sql
stable
security definer
set search_path = public
as $$
  select p.market_category, public.market_norm(s.city) as city,
         count(*) as products, array_agg(distinct s.id) as shop_ids, min(p.price) as min_price
  from public.products p
  join public.shops s on s.id = p.shop_id
  where (p.shop_id in (select m.shop_id from public.market_shop_ids() m)
         or p.id in (select k.product_id from public.market_pick_ids() k))
    and p.status in ('active', 'sold_out')
    and public.market_item_visible(p.id, p.subject_type)
  group by p.market_category, public.market_norm(s.city);
$$;

-- 6. Admin : annonces des boutiques sous le seuil, avec leur image et l'état du choix
create or replace function public.admin_market_pick_candidates()
returns table (
  product_id uuid, name text, slug text, status text, subject_type text, price integer,
  image_path text, poster_key uuid, visible boolean, picked boolean,
  shop_id uuid, shop_name text, shop_slug text, shop_city text, shop_visible_items bigint, min_items integer
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.slug, p.status, p.subject_type, p.price,
         case when m.media like 'poster:%' then null else m.media end,
         case when m.media like 'poster:%' then substr(m.media, 8)::uuid end,
         m.media is not null,
         exists (select 1 from public.market_product_picks k where k.product_id = p.id),
         s.id, s.name, s.slug, s.city, b.visible_items, b.min_items
  from public.market_below_threshold_shops() b
  join public.shops s on s.id = b.shop_id
  join public.products p on p.shop_id = s.id and p.status in ('active', 'sold_out')
  cross join lateral (select public.product_media(p.id) as media) m
  where b.visible_items > 0
  order by s.name, (m.media is null), p.updated_at desc;
$$;
revoke all on function public.admin_market_pick_candidates() from public, anon, authenticated;
grant execute on function public.admin_market_pick_candidates() to service_role;
