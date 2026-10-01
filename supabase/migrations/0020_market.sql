-- ─────────────────────────────────────────────────────────────────────────────
-- 0020 — Jaarle Market (à exécuter après 0019_monetization.sql)
--
-- Le Market regroupe les produits des boutiques PRO. Une boutique y apparaît si :
--   • elle est publiée, dans un secteur « produits » (mode, beauté, épicerie…) ;
--   • son propriétaire a un abonnement payant actif (plan ≠ free) ;
--   • son numéro WhatsApp est celui du compte, confirmé par SMS à l'inscription ;
--   • elle a au moins 3 produits en vente (active / sold_out) avec au moins une photo.
-- Tout est calculé à la lecture (jamais un indicateur stocké qui deviendrait faux à l'expiration
-- d'un abonnement). Les visiteurs ne lisent le Market QUE via les fonctions ci-dessous
-- (security definer, colonnes publiques uniquement) : ni abonnements ni comptes exposés.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Catégorie Market d'un produit : clé d'une feuille / sous-catégorie de lib/knowledge/category-tree.ts
alter table public.products add column if not exists market_category text;
do $$ begin
  alter table public.products add constraint products_market_category_format
    check (market_category is null or market_category ~ '^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$');
exception when duplicate_object then null; end $$;
create index if not exists products_market_category_idx on public.products(market_category)
  where status in ('active', 'sold_out');

-- 2. Normalisation des villes (même règle que slugify() dans lib/market/cities.ts)
create or replace function public.market_norm(t text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(both '-' from regexp_replace(
      translate(lower(coalesce(t, '')), 'àâäáãåéèêëíìîïóòôöõúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn'),
      '[^a-z0-9]+', '-', 'g')),
    '');
$$;

-- 3. Boutiques éligibles au Market (usage interne des fonctions ci-dessous)
create or replace function public.market_shop_ids()
returns table (shop_id uuid)
language sql
stable
security definer
set search_path = public, auth
as $$
  select s.id
  from public.shops s
  join auth.users u on u.id = s.owner_id
  where s.status = 'published'
    and s.industry in ('fashion', 'beauty', 'grocery', 'agriculture', 'poissonnerie', 'furniture', 'electronics', 'artisanat')
    and u.phone_confirmed_at is not null
    and regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') = regexp_replace(s.whatsapp, '\D', '', 'g')
    and exists (
      select 1 from public.subscriptions sub
      where sub.user_id = s.owner_id and sub.status = 'active' and sub.plan_key <> 'free'
        and sub.starts_at <= now() and sub.ends_at > now()
    )
    and (
      select count(*) from public.products p
      where p.shop_id = s.id and p.status in ('active', 'sold_out')
        and exists (select 1 from public.product_images i where i.product_id = p.id)
    ) >= 3;
$$;
revoke all on function public.market_shop_ids() from public, anon, authenticated;
grant execute on function public.market_shop_ids() to service_role;

-- 4. Produits du Market (listes, recherche, catégories, villes)
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
           s.district as shop_district, s.logo_path as shop_logo_path
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

-- 5. Boutiques du Market (accueil, annuaire, badge PRO)
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
         array(
           select i.path from public.products p
           join lateral (select pi.path from public.product_images pi where pi.product_id = p.id order by pi.position limit 1) i on true
           where p.shop_id = s.id and p.status = 'active'
           order by p.position, p.created_at desc
           limit 3
         ) as thumbs,
         count(*) over () as total_count
  from public.shops s
  where s.id in (select m.shop_id from public.market_shop_ids() m)
    and (p_city is null or public.market_norm(s.city) = p_city)
  order by s.published_at desc nulls last, s.id
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- 6. Comptages par catégorie × ville (seuils d'indexation, sitemap, compteurs affichés)
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
    and exists (select 1 from public.product_images i where i.product_id = p.id)
  group by p.market_category, public.market_norm(s.city);
$$;

revoke all on function public.market_products(text[], text, uuid, text, integer, integer, text, integer, integer) from public;
revoke all on function public.market_shops(text, integer, integer) from public;
revoke all on function public.market_counts() from public;
grant execute on function public.market_products(text[], text, uuid, text, integer, integer, text, integer, integer) to anon, authenticated, service_role;
grant execute on function public.market_shops(text, integer, integer) to anon, authenticated, service_role;
grant execute on function public.market_counts() to anon, authenticated, service_role;

-- 6 bis. Annuaire /boutiques : toutes les boutiques publiées indexables (≥ 3 produits en vente),
-- Pro ou non, avec un indicateur « listed » (présente sur le Market → badge PRO).
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
         array(
           select i.path from public.products p
           join lateral (select pi.path from public.product_images pi where pi.product_id = p.id order by pi.position limit 1) i on true
           where p.shop_id = c.id and p.status = 'active'
           order by p.position, p.created_at desc
           limit 3
         ) as thumbs,
         c.id in (select l.shop_id from listed l) as listed,
         count(*) over () as total_count
  from counted c
  where c.n >= 3
  order by (c.id in (select l.shop_id from listed l)) desc, c.updated_at desc, c.id
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.shop_directory(text, integer, integer) from public;
grant execute on function public.shop_directory(text, integer, integer) to anon, authenticated, service_role;

-- 7. Statut Market de SA boutique (tableau de bord vendeur : ce qui manque pour apparaître)
create or replace function public.my_market_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_shop public.shops%rowtype;
  v_user auth.users%rowtype;
  v_pro boolean;
  v_ready integer;
  v_uncategorized integer;
begin
  if auth.uid() is null then return null; end if;
  select * into v_shop from public.shops where owner_id = auth.uid() limit 1;
  if v_shop.id is null then return null; end if;
  select * into v_user from auth.users where id = auth.uid();
  select exists (
    select 1 from public.subscriptions sub
    where sub.user_id = auth.uid() and sub.status = 'active' and sub.plan_key <> 'free'
      and sub.starts_at <= now() and sub.ends_at > now()
  ) into v_pro;
  select count(*) into v_ready from public.products p
  where p.shop_id = v_shop.id and p.status in ('active', 'sold_out')
    and exists (select 1 from public.product_images i where i.product_id = p.id);
  select count(*) into v_uncategorized from public.products p
  where p.shop_id = v_shop.id and p.status in ('active', 'sold_out') and p.market_category is null;
  return jsonb_build_object(
    'published', v_shop.status = 'published',
    'eligible_industry', coalesce(v_shop.industry in ('fashion', 'beauty', 'grocery', 'agriculture', 'poissonnerie', 'furniture', 'electronics', 'artisanat'), false),
    'pro', v_pro,
    'whatsapp_verified', v_user.phone_confirmed_at is not null
      and regexp_replace(coalesce(v_user.phone, ''), '\D', '', 'g') = regexp_replace(v_shop.whatsapp, '\D', '', 'g'),
    'products_with_photo', v_ready,
    'uncategorized', v_uncategorized,
    'listed', v_shop.id in (select m.shop_id from public.market_shop_ids() m)
  );
end;
$$;
revoke all on function public.my_market_status() from public, anon;
grant execute on function public.my_market_status() to authenticated, service_role;

-- 8. Signalements (bouton « Signaler » des boutiques et produits)
create table if not exists public.shop_reports (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  reason text not null,
  details text,
  reporter_contact text,
  reporter_user_id uuid references auth.users(id) on delete set null,
  visitor_hash text,
  status text not null default 'open',
  admin_note text,
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  constraint shop_reports_reason_check check (reason in ('scam', 'counterfeit', 'prohibited', 'misleading', 'offensive', 'unreachable', 'other')),
  constraint shop_reports_details_length check (details is null or char_length(details) <= 1000),
  constraint shop_reports_contact_length check (reporter_contact is null or char_length(reporter_contact) <= 120),
  constraint shop_reports_status_check check (status in ('open', 'reviewing', 'dismissed', 'actioned'))
);
create index if not exists shop_reports_shop_idx on public.shop_reports(shop_id, created_at desc);
create index if not exists shop_reports_status_idx on public.shop_reports(status, created_at desc);
create index if not exists shop_reports_visitor_idx on public.shop_reports(visitor_hash, created_at desc);
-- Aucune policy : écriture uniquement par l'API serveur (service_role, anti-abus), lecture par le futur tableau admin.
alter table public.shop_reports enable row level security;
