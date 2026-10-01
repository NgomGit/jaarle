-- ─────────────────────────────────────────────────────────────────────────────
-- 0023 — Services sur Jaarle Market (à exécuter après 0022)
--
-- • Un SERVICE s'affiche avec son AFFICHE (la dernière version de la dernière affiche débloquée
--   liée à la fiche), jamais avec la photo envoyée. Sans affiche, le service n'apparaît pas sur le
--   Market. Un PRODUIT s'affiche toujours avec sa 1re photo.
-- • Les affiches sont dans le bucket privé « creations » : le public y accède uniquement par la
--   route /affiche/{clé} (serveur), qui revérifie tout. Les fonctions ci-dessous ne renvoient
--   qu'une clé (id de version ou d'affiche), jamais un chemin de fichier.
-- • Nouveaux secteurs ouverts : services, événementiel, restauration, immobilier.
-- • market_products : type (produit / service), clé d'affiche, filtre p_type.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Clé de l'affiche d'une fiche (interne)
create or replace function public.product_poster_key(p_product uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
           (select v.id from public.creation_versions v where v.creation_id = c.id order by v.created_at desc limit 1),
           c.id)
  from public.creations c
  where c.product_id = p_product and c.unlocked and c.poster_path is not null
  order by c.created_at desc
  limit 1;
$$;
revoke all on function public.product_poster_key(uuid) from public, anon, authenticated;
grant execute on function public.product_poster_key(uuid) to service_role;

-- 2. Élément visible sur le Market : produit avec photo, ou service avec affiche (interne)
create or replace function public.market_item_visible(p_product uuid, p_subject_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_subject_type = 'service' then public.product_poster_key(p_product) is not null
    else exists (select 1 from public.product_images i where i.product_id = p_product)
  end;
$$;
revoke all on function public.market_item_visible(uuid, text) from public, anon, authenticated;
grant execute on function public.market_item_visible(uuid, text) to service_role;

-- 3. Boutiques éligibles : nouveaux secteurs + 3 éléments visibles
create or replace function public.market_shop_ids()
returns table (shop_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.shops s
  where s.status = 'published'
    and s.industry in ('fashion', 'beauty', 'grocery', 'agriculture', 'poissonnerie', 'furniture', 'electronics', 'artisanat',
                       'services', 'events', 'restaurant', 'real-estate')
    and exists (
      select 1 from public.subscriptions sub
      where sub.user_id = s.owner_id and sub.status = 'active' and sub.plan_key <> 'free'
        and sub.starts_at <= now() and sub.ends_at > now()
    )
    and (
      select count(*) from public.products p
      where p.shop_id = s.id and p.status in ('active', 'sold_out')
        and public.market_item_visible(p.id, p.subject_type)
    ) >= 3;
$$;
revoke all on function public.market_shop_ids() from public, anon, authenticated;
grant execute on function public.market_shop_ids() to service_role;

-- 4. Produits et services du Market
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
           case when p.subject_type = 'service' then null
                else (select i.path from public.product_images i where i.product_id = p.id order by i.position limit 1) end as image_path,
           case when p.subject_type = 'service' then public.product_poster_key(p.id) end as poster_key,
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
  select b.id, b.slug, b.name, b.price, b.status, b.market_category, b.subject_type, b.created_at, b.image_path, b.poster_key,
         b.shop_id, b.shop_slug, b.shop_name, b.shop_city, b.shop_district, b.shop_logo_path,
         b.shop_whatsapp, b.shop_phone,
         count(*) over () as total_count
  from base b
  where (b.subject_type = 'service' and b.poster_key is not null)
     or (b.subject_type <> 'service' and b.image_path is not null)
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

-- 5. Vignettes des boutiques : chemin de photo (produit) ou « poster:<clé> » (service)
create or replace function public.market_thumbs(p_shop uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array(
    select t.thumb from (
      select case when p.subject_type = 'service'
                  then 'poster:' || public.product_poster_key(p.id)::text
                  else (select pi.path from public.product_images pi where pi.product_id = p.id order by pi.position limit 1) end as thumb,
             p.position, p.created_at
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

create or replace function public.market_shops(
  p_city text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid, slug text, name text, category_label text, city text, district text, logo_path text,
  product_count bigint, thumbs text[], total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.slug, s.name, s.category_label, s.city, s.district, s.logo_path,
         (select count(*) from public.products p where p.shop_id = s.id and p.status in ('active', 'sold_out')) as product_count,
         public.market_thumbs(s.id) as thumbs,
         count(*) over () as total_count
  from public.shops s
  where s.id in (select m.shop_id from public.market_shop_ids() m)
    and (p_city is null or public.market_norm(s.city) = p_city)
  order by s.published_at desc nulls last, s.id
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.shop_directory(
  p_city text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid, slug text, name text, category_label text, city text, district text, logo_path text,
  product_count bigint, thumbs text[], listed boolean, total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with counted as (
    select s.*,
           (select count(*) from public.products p where p.shop_id = s.id and p.status in ('active', 'sold_out')) as n
    from public.shops s
    where s.status = 'published'
      and (p_city is null or public.market_norm(s.city) = p_city)
  ),
  listed as (select m.shop_id from public.market_shop_ids() m)
  select c.id, c.slug, c.name, c.category_label, c.city, c.district, c.logo_path, c.n as product_count,
         public.market_thumbs(c.id) as thumbs,
         c.id in (select l.shop_id from listed l) as listed,
         count(*) over () as total_count
  from counted c
  where c.n >= 3
  order by (c.id in (select l.shop_id from listed l)) desc, c.updated_at desc, c.id
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- 6. Comptages : mêmes règles de visibilité
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
  where p.shop_id in (select m.shop_id from public.market_shop_ids() m)
    and p.status in ('active', 'sold_out')
    and public.market_item_visible(p.id, p.subject_type)
  group by p.market_category, public.market_norm(s.city);
$$;

-- 7. Affiches des services d'une boutique publiée (vitrine publique) : clé seulement
create or replace function public.shop_service_posters(p_shop uuid)
returns table (product_id uuid, poster_key uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, public.product_poster_key(p.id)
  from public.products p
  join public.shops s on s.id = p.shop_id
  where p.shop_id = p_shop and s.status = 'published'
    and p.subject_type = 'service' and p.status in ('active', 'sold_out')
    and public.product_poster_key(p.id) is not null;
$$;
revoke all on function public.shop_service_posters(uuid) from public;
grant execute on function public.shop_service_posters(uuid) to anon, authenticated, service_role;

-- 8. Statut Market du vendeur : éléments visibles + services sans affiche
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
    and public.product_poster_key(p.id) is null;
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
