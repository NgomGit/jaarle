-- ─────────────────────────────────────────────────────────────────────────────
-- 0028 — Recherche du Market (à exécuter après 0027)
--
-- market_products() gagne deux paramètres facultatifs (les appels existants ne changent pas) :
-- • p_available : true = seulement les annonces disponibles (les épuisées sont écartées) ;
-- • p_q_categories : catégories reconnues dans la recherche (« chaussures » → les produits classés
--   en Chaussures, même si le mot n'est pas dans leur nom).
-- La recherche texte couvre aussi la ville et le quartier de la boutique.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.market_products(text[], text, uuid, text, integer, integer, text, integer, integer, text);
drop function if exists public.market_products(text[], text, uuid, text, integer, integer, text, integer, integer, text, boolean, text[]);
create function public.market_products(
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
  q as (
    select nullif(replace(replace(replace(btrim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_'), '') as term
  ),
  base as (
    select p.id, p.slug, p.name, p.price, p.status, p.market_category, p.subject_type, p.created_at, p.updated_at,
           public.product_media(p.id) as media,
           s.id as shop_id, s.slug as shop_slug, s.name as shop_name, s.city as shop_city,
           s.district as shop_district, s.logo_path as shop_logo_path,
           s.whatsapp as shop_whatsapp, s.phone as shop_phone,
           e.is_pro
    from public.products p
    join public.shops s on s.id = p.shop_id
    join elig e on e.shop_id = p.shop_id
    cross join q
    where p.status in ('active', 'sold_out')
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
