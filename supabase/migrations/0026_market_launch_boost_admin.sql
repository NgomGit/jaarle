-- ─────────────────────────────────────────────────────────────────────────────
-- 0026 — Ouverture du Market, mise en avant des boutiques Pro, outils admin
--        (à exécuter après 0025)
--
-- 1. Réglages du Market (market_settings, une seule ligne, modifiable depuis l'admin) :
--    • période d'ouverture : jusqu'au 1er décembre 2026, toute boutique publiée d'un secteur
--      ouvert avec au moins 6 annonces visibles (« plus de 5 ») apparaît, Pro ou non ;
--    • en dehors de cette période (ou en plus) : Pro + 3 annonces visibles, comme avant.
-- 2. market_shop_ids() renvoie aussi is_pro → badge PRO seulement pour les Pro.
-- 3. Mise en avant interne des Pro :
--    • tri « pertinence » : les annonces « à la une » d'abord, puis un tour par boutique où les
--      Pro ont 3 places d'avance (une boutique Pro ne remplit pas seule la 1re page) ;
--    • market_boosts : bannières promotionnelles (placement 'banner') et remontées en tête
--      (placement 'spotlight'), créées par l'admin, ciblables par catégorie et ville, datées.
--      Elles ne s'affichent que pour une boutique Pro présente sur le Market ;
--    • market_pro_picks() : « Sélection PRO » du jour (1 annonce par boutique Pro, rotation
--      quotidienne), utilisée quand aucune bannière n'est programmée.
-- 4. Suspension d'une boutique : qui, quand, pourquoi (colonnes sur shops) + journal admin_actions.
-- 5. my_market_status() : chemin d'entrée (pro / ouverture), seuils, date de fin d'ouverture.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Réglages ─────────────────────────────────────────────────────────────────
create table if not exists public.market_settings (
  id boolean primary key default true,
  launch_until timestamptz,
  launch_min_items integer not null default 6,
  pro_min_items integer not null default 3,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint market_settings_singleton check (id),
  constraint market_settings_launch_min check (launch_min_items between 1 and 100),
  constraint market_settings_pro_min check (pro_min_items between 1 and 100)
);
insert into public.market_settings (id, launch_until, launch_min_items, pro_min_items)
values (true, '2026-12-01T00:00:00Z', 6, 3)
on conflict (id) do nothing;
-- Aucune policy : lecture / écriture par le serveur (service_role) uniquement.
alter table public.market_settings enable row level security;

-- Réglages publics (aucune donnée sensible) : textes du Market et carte vendeur.
create or replace function public.market_public_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'launch_until', s.launch_until,
    'launch_active', coalesce(s.launch_until > now(), false),
    'launch_min_items', s.launch_min_items,
    'pro_min_items', s.pro_min_items
  )
  from (select (select ms.launch_until from public.market_settings ms where ms.id) as launch_until,
               coalesce((select ms.launch_min_items from public.market_settings ms where ms.id), 6) as launch_min_items,
               coalesce((select ms.pro_min_items from public.market_settings ms where ms.id), 3) as pro_min_items) s;
$$;
revoke all on function public.market_public_settings() from public;
grant execute on function public.market_public_settings() to anon, authenticated, service_role;

-- Abonnement payant actif (interne).
create or replace function public.user_is_pro(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions sub
    where sub.user_id = p_user and sub.status = 'active' and sub.plan_key <> 'free'
      and sub.starts_at <= now() and sub.ends_at > now()
  );
$$;
revoke all on function public.user_is_pro(uuid) from public, anon, authenticated;
grant execute on function public.user_is_pro(uuid) to service_role;

-- 2. Boutiques du Market (+ is_pro) ────────────────────────────────────────────
drop function if exists public.market_shop_ids();
create function public.market_shop_ids()
returns table (shop_id uuid, is_pro boolean)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select coalesce(s.launch_until > now(), false) as launch_active, s.launch_min_items, s.pro_min_items
    from (select (select ms.launch_until from public.market_settings ms where ms.id) as launch_until,
                 coalesce((select ms.launch_min_items from public.market_settings ms where ms.id), 6) as launch_min_items,
                 coalesce((select ms.pro_min_items from public.market_settings ms where ms.id), 3) as pro_min_items) s
  ),
  cand as (
    select s.id, public.user_is_pro(s.owner_id) as is_pro,
           (select count(*) from public.products p
            where p.shop_id = s.id and p.status in ('active', 'sold_out')
              and public.market_item_visible(p.id, p.subject_type)) as n
    from public.shops s
    where s.status = 'published'
      and s.industry in ('fashion', 'beauty', 'grocery', 'agriculture', 'poissonnerie', 'furniture', 'electronics', 'artisanat',
                         'services', 'events', 'restaurant', 'real-estate')
  )
  select c.id, c.is_pro
  from cand c cross join cfg
  where (c.is_pro and c.n >= cfg.pro_min_items)
     or (cfg.launch_active and c.n >= cfg.launch_min_items);
$$;
revoke all on function public.market_shop_ids() from public, anon, authenticated;
grant execute on function public.market_shop_ids() to service_role;

-- 3. Mises en avant ───────────────────────────────────────────────────────────
create table if not exists public.market_boosts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  placement text not null,
  title text,
  subtitle text,
  cta_label text,
  -- Ciblage : slug de catégorie Market (affichage) + ses clés de feuilles (filtre), ville (market_norm).
  category_slug text,
  category_keys text[],
  city text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  priority integer not null default 0,
  active boolean not null default true,
  source text not null default 'admin',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint market_boosts_placement_check check (placement in ('banner', 'spotlight')),
  constraint market_boosts_source_check check (source in ('admin', 'included', 'paid')),
  constraint market_boosts_dates_check check (ends_at > starts_at),
  constraint market_boosts_title_length check (title is null or char_length(title) <= 80),
  constraint market_boosts_subtitle_length check (subtitle is null or char_length(subtitle) <= 160),
  constraint market_boosts_cta_length check (cta_label is null or char_length(cta_label) <= 30),
  constraint market_boosts_priority_range check (priority between -100 and 100)
);
create index if not exists market_boosts_live_idx on public.market_boosts(placement, active, ends_at);
create index if not exists market_boosts_shop_idx on public.market_boosts(shop_id);
drop trigger if exists market_boosts_updated_at on public.market_boosts;
create trigger market_boosts_updated_at before update on public.market_boosts
  for each row execute function public.set_updated_at();

-- Le produit mis en avant doit appartenir à la boutique.
create or replace function public.market_boosts_check()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.product_id is not null and not exists (
    select 1 from public.products p where p.id = new.product_id and p.shop_id = new.shop_id
  ) then
    raise exception 'Le produit mis en avant n''appartient pas à cette boutique.';
  end if;
  return new;
end;
$$;
drop trigger if exists market_boosts_check on public.market_boosts;
create trigger market_boosts_check before insert or update on public.market_boosts
  for each row execute function public.market_boosts_check();

-- Aucune policy : gestion par l'admin (service_role), lecture publique via les fonctions ci-dessous.
alter table public.market_boosts enable row level security;

-- Annonce « à la une » (spotlight actif, boutique Pro) — interne.
create or replace function public.market_item_boosted(p_product uuid, p_shop uuid, p_category text, p_city text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.market_boosts b
    where b.placement = 'spotlight' and b.active
      and b.starts_at <= now() and b.ends_at > now()
      and b.shop_id = p_shop
      and (b.product_id is null or b.product_id = p_product)
      and (b.category_keys is null or p_category = any(b.category_keys))
      and (b.city is null or b.city = public.market_norm(p_city))
  );
$$;
revoke all on function public.market_item_boosted(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.market_item_boosted(uuid, uuid, text, text) to service_role;

-- 4. Produits du Market (+ is_pro, boosted, tri pertinence avec avance Pro) ────────
drop function if exists public.market_products(text[], text, uuid, text, integer, integer, text, integer, integer, text);
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
  p_type text default null
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
      and (q.term is null
           or p.name ilike '%' || q.term || '%'
           or p.description ilike '%' || q.term || '%'
           or p.category ilike '%' || q.term || '%'
           or s.name ilike '%' || q.term || '%')
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
revoke all on function public.market_products(text[], text, uuid, text, integer, integer, text, integer, integer, text) from public;
grant execute on function public.market_products(text[], text, uuid, text, integer, integer, text, integer, integer, text) to anon, authenticated, service_role;

-- 5. Boutiques du Market et annuaire (+ is_pro, Pro en premier) ───────────────────
drop function if exists public.market_shops(text, integer, integer);
create function public.market_shops(
  p_city text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid, slug text, name text, category_label text, city text, district text, logo_path text,
  product_count bigint, thumbs text[], is_pro boolean, total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.slug, s.name, s.category_label, s.city, s.district, s.logo_path,
         (select count(*) from public.products p where p.shop_id = s.id and p.status in ('active', 'sold_out')) as product_count,
         public.market_thumbs(s.id) as thumbs,
         m.is_pro,
         count(*) over () as total_count
  from public.shops s
  join public.market_shop_ids() m on m.shop_id = s.id
  where (p_city is null or public.market_norm(s.city) = p_city)
  order by m.is_pro desc, s.published_at desc nulls last, s.id
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.market_shops(text, integer, integer) from public;
grant execute on function public.market_shops(text, integer, integer) to anon, authenticated, service_role;

drop function if exists public.shop_directory(text, integer, integer);
create function public.shop_directory(
  p_city text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid, slug text, name text, category_label text, city text, district text, logo_path text,
  product_count bigint, thumbs text[], listed boolean, is_pro boolean, total_count bigint
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
  listed as (select m.shop_id, m.is_pro from public.market_shop_ids() m)
  select c.id, c.slug, c.name, c.category_label, c.city, c.district, c.logo_path, c.n as product_count,
         public.market_thumbs(c.id) as thumbs,
         l.shop_id is not null as listed,
         coalesce(l.is_pro, false) as is_pro,
         count(*) over () as total_count
  from counted c
  left join listed l on l.shop_id = c.id
  where c.n >= 3
  order by coalesce(l.is_pro, false) desc, (l.shop_id is not null) desc, c.updated_at desc, c.id
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.shop_directory(text, integer, integer) from public;
grant execute on function public.shop_directory(text, integer, integer) to anon, authenticated, service_role;

-- 6. Bannières promotionnelles en cours (boutiques Pro présentes sur le Market) ────
create or replace function public.market_banners()
returns table (
  id uuid, title text, subtitle text, cta_label text, category_slug text, category_keys text[], city text, priority integer,
  product_id uuid, product_slug text, product_name text, price integer, subject_type text, media text,
  shop_id uuid, shop_slug text, shop_name text, shop_city text, shop_logo_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.title, b.subtitle, b.cta_label, b.category_slug, b.category_keys, b.city, b.priority,
         p.id, p.slug, p.name, p.price, p.subject_type,
         coalesce(public.product_media(p.id), (public.market_thumbs(s.id))[1]) as media,
         s.id, s.slug, s.name, s.city, s.logo_path
  from public.market_boosts b
  join public.shops s on s.id = b.shop_id
  join public.market_shop_ids() m on m.shop_id = s.id and m.is_pro
  left join public.products p on p.id = b.product_id and p.status in ('active', 'sold_out')
  where b.placement = 'banner' and b.active
    and b.starts_at <= now() and b.ends_at > now()
    and (b.product_id is null or p.id is not null)
  order by b.priority desc, b.starts_at desc, b.id
  limit 20;
$$;
revoke all on function public.market_banners() from public;
grant execute on function public.market_banners() to anon, authenticated, service_role;

-- 7. Sélection PRO du jour : 1 annonce par boutique Pro, ordre qui change chaque jour ──
create or replace function public.market_pro_picks(p_limit integer default 8)
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
  with pro as (select m.shop_id from public.market_shop_ids() m where m.is_pro),
  best as (
    select distinct on (p.shop_id)
           p.id, p.slug, p.name, p.price, p.status, p.market_category, p.subject_type, p.created_at,
           public.product_media(p.id) as media, p.shop_id
    from public.products p
    where p.shop_id in (select pro.shop_id from pro)
      and p.status = 'active'
      and public.product_media(p.id) is not null
    -- Une annonce différente chaque jour dans chaque boutique.
    order by p.shop_id, md5(p.id::text || current_date::text)
  )
  select b.id, b.slug, b.name, b.price, b.status, b.market_category, b.subject_type, b.created_at,
         case when b.media like 'poster:%' then null else b.media end,
         case when b.media like 'poster:%' then substr(b.media, 8)::uuid end,
         s.id, s.slug, s.name, s.city, s.district, s.logo_path, s.whatsapp, s.phone,
         true, false,
         count(*) over ()
  from best b
  join public.shops s on s.id = b.shop_id
  order by md5(b.shop_id::text || current_date::text)
  limit least(greatest(coalesce(p_limit, 8), 1), 24);
$$;
revoke all on function public.market_pro_picks(integer) from public;
grant execute on function public.market_pro_picks(integer) to anon, authenticated, service_role;

-- 8. Suspension + journal admin ───────────────────────────────────────────────
alter table public.shops add column if not exists suspended_at timestamptz;
alter table public.shops add column if not exists suspended_reason text;
alter table public.shops add column if not exists suspended_by uuid references auth.users(id) on delete set null;
alter table public.shops drop constraint if exists shops_suspended_reason_length;
alter table public.shops add constraint shops_suspended_reason_length check (suspended_reason is null or char_length(suspended_reason) <= 500);

create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_actions_target_idx on public.admin_actions(target_type, target_id, created_at desc);
create index if not exists admin_actions_created_idx on public.admin_actions(created_at desc);
-- Aucune policy : écriture et lecture par le serveur (service_role) uniquement.
alter table public.admin_actions enable row level security;

-- 9. Statut Market du vendeur ─────────────────────────────────────────────────
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
  v_listed boolean;
  v_cfg jsonb;
begin
  if auth.uid() is null then return null; end if;
  select * into v_shop from public.shops where owner_id = auth.uid() limit 1;
  if v_shop.id is null then return null; end if;
  v_pro := public.user_is_pro(auth.uid());
  v_cfg := public.market_public_settings();
  select count(*) into v_ready from public.products p
  where p.shop_id = v_shop.id and p.status in ('active', 'sold_out') and public.market_item_visible(p.id, p.subject_type);
  select count(*) into v_uncategorized from public.products p
  where p.shop_id = v_shop.id and p.status in ('active', 'sold_out') and p.market_category is null;
  select count(*) into v_no_poster from public.products p
  where p.shop_id = v_shop.id and p.status in ('active', 'sold_out') and p.subject_type = 'service'
    and p.display_media = 'poster' and public.product_poster_key(p.id) is null;
  v_listed := v_shop.id in (select m.shop_id from public.market_shop_ids() m);
  return jsonb_build_object(
    'published', v_shop.status = 'published',
    'suspended', v_shop.status = 'suspended',
    'eligible_industry', coalesce(v_shop.industry in ('fashion', 'beauty', 'grocery', 'agriculture', 'poissonnerie', 'furniture', 'electronics', 'artisanat',
                                                       'services', 'events', 'restaurant', 'real-estate'), false),
    'pro', v_pro,
    'products_with_photo', v_ready,
    'uncategorized', v_uncategorized,
    'services_without_poster', v_no_poster,
    'listed', v_listed,
    'listed_via', case when not v_listed then null when v_pro and v_ready >= (v_cfg->>'pro_min_items')::int then 'pro' else 'launch' end,
    'launch_active', (v_cfg->>'launch_active')::boolean,
    'launch_until', v_cfg->'launch_until',
    'launch_min_items', (v_cfg->>'launch_min_items')::int,
    'pro_min_items', (v_cfg->>'pro_min_items')::int
  );
end;
$$;
revoke all on function public.my_market_status() from public, anon;
grant execute on function public.my_market_status() to authenticated, service_role;
