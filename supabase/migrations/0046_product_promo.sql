-- 0046 — Promo sur les produits (réservée au Pro)
-- • products.compare_at_price (existe depuis 0015) = ancien prix barré ; products.price reste le
--   prix payé aujourd'hui (panier, WhatsApp, filtres et tri inchangés) ; promo_ends_at facultatif.
-- • Écriture : seul un vendeur Pro peut poser ou modifier une promo (retirer reste toujours possible).
-- • Fin automatique (pg_cron, toutes les heures) : date passée OU vendeur plus Pro → l'ancien prix
--   redevient le prix, la promo est retirée.
-- • market_products() renvoie l'ancien prix (seulement si la promo est visible) et accepte
--   p_promo (rangée « Promos », filtre « En promo ») et p_sort = 'promo'.
-- À exécuter après 0042. Rejouable.

-- 1. Colonnes et règles ────────────────────────────────────────────────────────
alter table public.products add column if not exists promo_ends_at timestamptz;

-- Données incohérentes éventuelles (champ jamais utilisé jusqu'ici) : on les nettoie.
update public.products set compare_at_price = null
where compare_at_price is not null and (price is null or compare_at_price <= price);
update public.products set promo_ends_at = null where promo_ends_at is not null and compare_at_price is null;

alter table public.products drop constraint if exists products_promo_valid;
alter table public.products add constraint products_promo_valid check (
  compare_at_price is null
  or (price is not null and compare_at_price > price and price * 10 >= compare_at_price) -- remise ≤ 90 %
);
alter table public.products drop constraint if exists products_promo_end_needs_promo;
alter table public.products add constraint products_promo_end_needs_promo check (promo_ends_at is null or compare_at_price is not null);
create index if not exists products_promo_idx on public.products(promo_ends_at) where compare_at_price is not null;

-- 2. Pro obligatoire pour poser / modifier une promo (vendeurs : rôles anon / authenticated)
-- Accès promo d'un vendeur. SECURITY DEFINER : user_is_pro() n'est pas exécutable par les vendeurs.
create or replace function public.owner_has_promo_access(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_is_pro(p_owner);
$$;
revoke all on function public.owner_has_promo_access(uuid) from public;
grant execute on function public.owner_has_promo_access(uuid) to anon, authenticated, service_role;

-- Pas SECURITY DEFINER : current_user doit rester le rôle de l'appelant.
create or replace function public.products_promo_require_pro()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') or new.compare_at_price is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.compare_at_price is not distinct from old.compare_at_price
     and new.price is not distinct from old.price
     and new.promo_ends_at is not distinct from old.promo_ends_at then
    return new; -- promo inchangée (ex. modification du nom)
  end if;
  if not public.owner_has_promo_access(new.owner_id) then
    raise exception 'PRO_REQUIRED:promo' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists products_promo_require_pro on public.products;
create trigger products_promo_require_pro
  before insert or update on public.products
  for each row execute function public.products_promo_require_pro();

-- 3. Fin des promos : date passée, ou vendeur qui n'est plus Pro
create or replace function public.end_expired_promos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.products p
     set price = p.compare_at_price, compare_at_price = null, promo_ends_at = null
   where p.compare_at_price is not null
     and ((p.promo_ends_at is not null and p.promo_ends_at <= now()) or not public.user_is_pro(p.owner_id));
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.end_expired_promos() from public, anon, authenticated;
grant execute on function public.end_expired_promos() to service_role;

-- Tâche planifiée (toutes les heures, à la minute 5). Si pg_cron n'est pas activé, la migration
-- continue : active « pg_cron » dans Supabase (Database → Extensions) puis relance ce fichier.
do $do$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron indisponible (%). Active l''extension puis relance cette migration.', sqlerrm;
  end;
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('jaarle-end-expired-promos', '5 * * * *', 'select public.end_expired_promos()');
  end if;
end
$do$;

-- 4. Market : ancien prix + filtre promo ───────────────────────────────────────
drop function if exists public.market_products(text[], text, uuid, text, integer, integer, text, integer, integer, text, boolean, text[], text[]);
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
  p_q_groups text[] default null,
  p_promo boolean default null
)
returns table (
  id uuid, slug text, name text, price integer, compare_at_price integer, promo_ends_at timestamptz, status text, market_category text, subject_type text,
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
    select p.id, p.slug, p.name, p.price, p.compare_at_price, p.promo_ends_at, p.status, p.market_category, p.subject_type, p.created_at, p.updated_at,
           public.product_media(p.id) as media,
           s.id as shop_id, s.slug as shop_slug, s.name as shop_name, s.city as shop_city,
           s.district as shop_district, s.logo_path as shop_logo_path,
           s.whatsapp as shop_whatsapp, s.phone as shop_phone,
           coalesce(e.is_pro, false) as is_pro,
           -- Promo visible : ancien prix > prix, pas expirée, boutique Pro (0046).
           (p.compare_at_price is not null and p.price is not null and p.compare_at_price > p.price
            and (p.promo_ends_at is null or p.promo_ends_at > now()) and coalesce(e.is_pro, false)) as promo_on,
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
      and (not coalesce(p_promo, false) or (
            p.compare_at_price is not null and p.price is not null and p.compare_at_price > p.price
            and (p.promo_ends_at is null or p.promo_ends_at > now()) and coalesce(e.is_pro, false)))
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
  select r.id, r.slug, r.name, r.price,
         case when r.promo_on then r.compare_at_price end as compare_at_price,
         case when r.promo_on then r.promo_ends_at end as promo_ends_at,
         r.status, r.market_category, r.subject_type, r.created_at,
         case when r.media like 'poster:%' then null else r.media end as image_path,
         case when r.media like 'poster:%' then substr(r.media, 8)::uuid end as poster_key,
         r.shop_id, r.shop_slug, r.shop_name, r.shop_city, r.shop_district, r.shop_logo_path,
         r.shop_whatsapp, r.shop_phone,
         r.is_pro, r.boosted,
         count(*) over () as total_count
  from ranked r
  order by
    -- Rangée « Promos » : les plus fortes remises d'abord.
    (case when p_sort = 'promo' and r.promo_on then (r.compare_at_price - r.price)::numeric / r.compare_at_price end) desc nulls last,
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
revoke all on function public.market_products(text[], text, uuid, text, integer, integer, text, integer, integer, text, boolean, text[], text[], boolean) from public;
grant execute on function public.market_products(text[], text, uuid, text, integer, integer, text, integer, integer, text, boolean, text[], text[], boolean) to anon, authenticated, service_role;

