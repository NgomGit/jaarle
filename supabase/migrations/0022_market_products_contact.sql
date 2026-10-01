-- ─────────────────────────────────────────────────────────────────────────────
-- 0022 — market_products renvoie aussi le WhatsApp et le téléphone de la boutique
-- (à exécuter après 0021). Les cartes produit du Market réutilisent celles de la vitrine,
-- avec leurs boutons Commander / Appeler / Partager. Ces numéros sont déjà publics sur la
-- page de chaque boutique. Le type de retour change : on supprime puis recrée la fonction.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.market_products(text[], text, uuid, text, integer, integer, text, integer, integer);

create or replace function public.market_products(
  p_categories text[] default null,
  p_city text default null,
  p_shop uuid default null,
  p_q text default null,
  p_min integer default null,
  p_max integer default null,
  p_sort text default 'relevance',
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid, slug text, name text, price integer, status text, market_category text,
  created_at timestamptz, image_path text,
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
    select p.id, p.slug, p.name, p.price, p.status, p.market_category, p.created_at, p.updated_at,
           (select i.path from public.product_images i where i.product_id = p.id order by i.position limit 1) as image_path,
           s.id as shop_id, s.slug as shop_slug, s.name as shop_name, s.city as shop_city,
           s.district as shop_district, s.logo_path as shop_logo_path,
           s.whatsapp as shop_whatsapp, s.phone as shop_phone
    from public.products p
    join public.shops s on s.id = p.shop_id
    cross join q
    where p.shop_id in (select e.shop_id from elig e)
      and p.status in ('active', 'sold_out')
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
  select b.id, b.slug, b.name, b.price, b.status, b.market_category, b.created_at, b.image_path,
         b.shop_id, b.shop_slug, b.shop_name, b.shop_city, b.shop_district, b.shop_logo_path,
         b.shop_whatsapp, b.shop_phone,
         count(*) over () as total_count
  from base b
  where b.image_path is not null
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

revoke all on function public.market_products(text[], text, uuid, text, integer, integer, text, integer, integer) from public;
grant execute on function public.market_products(text[], text, uuid, text, integer, integer, text, integer, integer) to anon, authenticated, service_role;
