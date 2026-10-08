-- ─────────────────────────────────────────────────────────────────────────────
-- 0042 — Recherche du Market plus tolérante + journal des recherches (après 0041)
--
-- market_products() gagne p_q_groups (facultatif ; les appels existants ne changent pas) :
-- chaque élément est un mot de la recherche avec ses variantes, séparées par « | »
-- (ex. {'robe', 'bazin|basin|getzner'}), déjà mis en minuscules et sans accent par l'app.
-- • une annonce correspond si CHAQUE mot (ou une variante) est trouvé quelque part : nom,
--   description, catégorie, boutique, ville, quartier — sans tenir compte des accents ni de l'ordre ;
-- • faute de frappe tolérée pour les mots de 5 lettres ou plus (pg_trgm, word_similarity ≥ 0,6) ;
-- • les catégories reconnues (p_q_categories) ajoutent toujours des résultats, comme avant ;
-- • tri « pertinence » : les annonces dont le NOM contient les mots passent devant.
-- market_search_logs : recherches « abouties » (le visiteur s'est arrêté de taper), écrites par le
-- serveur uniquement ; admin_market_search_stats() pour l'admin.
-- Rejouable.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_trgm with schema extensions;

-- 1. Texte « plié » : minuscules, sans accent, ponctuation → espace.
create or replace function public.market_fold(t text)
returns text
language sql
immutable
as $$
  select ' ' || btrim(regexp_replace(
    translate(lower(coalesce(t, '')), 'àâäáãåéèêëíìîïóòôöõúùûüçñœæ', 'aaaaaaeeeeiiiiooooouuuucnoa'),
    '[^a-z0-9]+', ' ', 'g')) || ' ';
$$;

-- 2. Un groupe de variantes correspond-il à ce texte plié ?
create or replace function public.market_group_matches(p_group text, p_hay text)
returns boolean
language sql
immutable
set search_path = public, extensions
as $$
  select exists (
    select 1
    from unnest(string_to_array(p_group, '|')) alt
    where length(alt) >= 2
      and (position(alt in p_hay) > 0
           or (length(alt) >= 5 and extensions.word_similarity(alt, p_hay) >= 0.6))
  );
$$;

-- 3. Produits et services du Market (reprend 0032 + p_q_groups)
drop function if exists public.market_products(text[], text, uuid, text, integer, integer, text, integer, integer, text, boolean, text[]);
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
  p_q_categories text[] default null,
  p_q_groups text[] default null
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
set search_path = public, extensions
as $$
  with elig as (select m.shop_id, m.is_pro from public.market_shop_ids() m),
  picks as (select k.product_id from public.market_pick_ids() k),
  q as (
    select nullif(replace(replace(replace(btrim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_'), '') as term,
           -- 8 mots maximum, variantes nettoyées (lettres et chiffres seulement).
           (select array_agg(g) from (
              select nullif(regexp_replace(lower(x), '[^a-z0-9 |]', '', 'g'), '') as g
              from unnest(p_q_groups[1:8]) x
            ) t where g is not null) as groups
  ),
  base as (
    select p.id, p.slug, p.name, p.price, p.status, p.market_category, p.subject_type, p.created_at, p.updated_at,
           public.product_media(p.id) as media,
           s.id as shop_id, s.slug as shop_slug, s.name as shop_name, s.city as shop_city,
           s.district as shop_district, s.logo_path as shop_logo_path,
           s.whatsapp as shop_whatsapp, s.phone as shop_phone,
           coalesce(e.is_pro, false) as is_pro,
           case when q.groups is null then 0 else (
             select count(*) from unnest(q.groups) grp where public.market_group_matches(grp, public.market_fold(p.name))
           ) end as name_hits
    from public.products p
    join public.shops s on s.id = p.shop_id
    left join elig e on e.shop_id = p.shop_id
    cross join q
    where p.status in ('active', 'sold_out')
      and (e.shop_id is not null or p.id in (select k.product_id from picks k))
      and (p_type is null or p.subject_type = p_type)
      and (p_categories is null or p.market_category = any(p_categories))
      and (p_city is null or public.market_norm(s.city) = p_city)
      and (p_shop is null or p.shop_id = p_shop)
      and (p_min is null or p.price >= p_min)
      and (p_max is null or p.price <= p_max)
      and (not coalesce(p_available, false) or p.status = 'active')
      and (
        (q.groups is null and q.term is null)
        or (p_q_categories is not null and p.market_category = any(p_q_categories))
        or (q.groups is not null and not exists (
              select 1 from unnest(q.groups) grp
              where not public.market_group_matches(
                grp,
                public.market_fold(concat_ws(' ', p.name, p.description, p.category, s.name, s.city, s.district))
              )))
        or (q.groups is null and (
              p.name ilike '%' || q.term || '%'
              or p.description ilike '%' || q.term || '%'
              or p.category ilike '%' || q.term || '%'
              or s.name ilike '%' || q.term || '%'
              or s.city ilike '%' || q.term || '%'
              or s.district ilike '%' || q.term || '%'))
      )
  ),
  ranked as (
    select b.*,
           (b.is_pro and public.market_item_boosted(b.id, b.shop_id, b.market_category, b.shop_city)) as boosted,
           row_number() over (partition by b.shop_id order by (b.status = 'sold_out'), b.name_hits desc, b.updated_at desc, b.id) as shop_rank
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
    (case when coalesce(p_sort, 'relevance') not in ('price_asc', 'price_desc', 'new') then r.name_hits end) desc nulls last,
    (case when p_sort = 'new' then r.created_at end) desc nulls last,
    (case when coalesce(p_sort, 'relevance') not in ('price_asc', 'price_desc', 'new')
          then r.shop_rank + (case when r.is_pro then 0 else 3 end) end) asc nulls last,
    r.is_pro desc,
    r.updated_at desc,
    r.id
  limit least(greatest(coalesce(p_limit, 24), 1), 60)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.market_products(text[], text, uuid, text, integer, integer, text, integer, integer, text, boolean, text[], text[]) from public;
grant execute on function public.market_products(text[], text, uuid, text, integer, integer, text, integer, integer, text, boolean, text[], text[]) to anon, authenticated, service_role;

-- 4. Journal des recherches (aucune donnée personnelle : ni compte, ni IP)
create table if not exists public.market_search_logs (
  id bigint generated always as identity primary key,
  q text not null,
  q_norm text not null,
  results integer not null,
  city text,
  category text,
  created_at timestamptz not null default now(),
  constraint market_search_logs_q_len check (char_length(q) between 2 and 80),
  constraint market_search_logs_results check (results >= 0)
);
create index if not exists market_search_logs_created_idx on public.market_search_logs(created_at desc);
alter table public.market_search_logs enable row level security;
-- Aucune policy : écriture et lecture par le serveur (service_role) uniquement.

-- 5. Statistiques pour l'admin : recherches groupées (forme pliée), les plus fréquentes d'abord.
create or replace function public.admin_market_search_stats(p_days integer default 30, p_limit integer default 100)
returns table (q_norm text, example text, searches bigint, zero_results bigint, last_results integer, last_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select l.q_norm,
         (array_agg(l.q order by l.created_at desc))[1] as example,
         count(*) as searches,
         count(*) filter (where l.results = 0) as zero_results,
         (array_agg(l.results order by l.created_at desc))[1] as last_results,
         max(l.created_at) as last_at
  from public.market_search_logs l
  where l.created_at >= now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
  group by l.q_norm
  order by count(*) filter (where l.results = 0) > 0 desc, count(*) desc, max(l.created_at) desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;
revoke all on function public.admin_market_search_stats(integer, integer) from public, anon, authenticated;
grant execute on function public.admin_market_search_stats(integer, integer) to service_role;
