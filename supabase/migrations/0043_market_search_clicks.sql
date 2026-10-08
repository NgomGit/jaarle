-- 0043 — Clics après une recherche du Market
-- Complète le journal des recherches (0042) : quand un visiteur clique sur un résultat (fiche,
-- WhatsApp, appel, boutique), on garde le terme cherché, le produit et sa position dans la liste.
-- Aucune donnée personnelle (ni compte, ni IP). Écriture et lecture par le serveur uniquement.
-- Rejouable.

create table if not exists public.market_search_clicks (
  id bigint generated always as identity primary key,
  q text not null,
  q_norm text not null,
  product_id uuid not null references public.products(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  position integer,
  action text not null,
  created_at timestamptz not null default now(),
  constraint market_search_clicks_q_len check (char_length(q) between 2 and 80),
  constraint market_search_clicks_action check (action in ('open', 'whatsapp', 'call', 'shop')),
  constraint market_search_clicks_position check (position is null or position between 1 and 10000)
);
create index if not exists market_search_clicks_created_idx on public.market_search_clicks(created_at desc);
create index if not exists market_search_clicks_qnorm_idx on public.market_search_clicks(q_norm, created_at desc);
alter table public.market_search_clicks enable row level security;
-- Aucune policy : service_role uniquement.

-- Clics par terme (forme pliée, comme admin_market_search_stats).
create or replace function public.admin_market_search_click_stats(p_days integer default 30)
returns table (q_norm text, clicks bigint, opens bigint, contacts bigint, products bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.q_norm,
         count(*) as clicks,
         count(*) filter (where c.action = 'open') as opens,
         count(*) filter (where c.action in ('whatsapp', 'call')) as contacts,
         count(distinct c.product_id) as products
  from public.market_search_clicks c
  where c.created_at >= now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
  group by c.q_norm;
$$;
revoke all on function public.admin_market_search_click_stats(integer) from public, anon, authenticated;
grant execute on function public.admin_market_search_click_stats(integer) to service_role;

-- Produits les plus cliqués depuis la recherche, avec le terme qui y mène le plus souvent.
create or replace function public.admin_market_search_top_products(p_days integer default 30, p_limit integer default 30)
returns table (
  product_id uuid, product_name text, product_slug text, shop_name text, shop_slug text,
  clicks bigint, contacts bigint, top_query text, avg_position numeric, last_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select * from public.market_search_clicks
    where created_at >= now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
  ),
  per_q as (
    select product_id, q_norm, (array_agg(q order by created_at desc))[1] as q, count(*) as n
    from c group by product_id, q_norm
  ),
  best_q as (
    select distinct on (product_id) product_id, q from per_q order by product_id, n desc
  )
  select p.id, p.name, p.slug, s.name, s.slug,
         count(*) as clicks,
         count(*) filter (where c.action in ('whatsapp', 'call')) as contacts,
         b.q as top_query,
         round(avg(c.position)::numeric, 1) as avg_position,
         max(c.created_at) as last_at
  from c
  join public.products p on p.id = c.product_id
  join public.shops s on s.id = c.shop_id
  left join best_q b on b.product_id = c.product_id
  group by p.id, p.name, p.slug, s.name, s.slug, b.q
  order by count(*) desc, max(c.created_at) desc
  limit least(greatest(coalesce(p_limit, 30), 1), 200);
$$;
revoke all on function public.admin_market_search_top_products(integer, integer) from public, anon, authenticated;
grant execute on function public.admin_market_search_top_products(integer, integer) to service_role;
