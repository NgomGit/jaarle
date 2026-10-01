-- ─────────────────────────────────────────────────────────────────────────────
-- 0025 — Tableau de bord admin : courbes, entonnoir, sources, top boutiques, Market, commandes
-- (à exécuter après 0024). Lecture seule, appelée côté serveur avec la clé service_role
-- (la page /dashboard/admin vérifie is_admin avant l'appel). Complète admin_metrics (0019).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.admin_dashboard(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since timestamptz := date_trunc('day', now()) - make_interval(days => v_days - 1);
  v_prev timestamptz := v_since - make_interval(days => v_days);
  v_contacts text[] := array['whatsapp_click', 'call_click', 'order_click'];
  v_views text[] := array['shop_view', 'product_view'];
  v_result jsonb;
begin
  with
  days as (
    select generate_series(v_since, date_trunc('day', now()), interval '1 day') as d
  ),
  ev as (
    select date_trunc('day', created_at) as d,
           count(*) filter (where type = any(v_contacts)) as contacts,
           count(*) filter (where type = any(v_views)) as visits
    from public.shop_events where created_at >= v_since group by 1
  ),
  su as (select date_trunc('day', created_at) as d, count(*) as n from auth.users where created_at >= v_since group by 1),
  sp as (select date_trunc('day', published_at) as d, count(*) as n from public.shops where published_at >= v_since group by 1),
  po as (select date_trunc('day', created_at) as d, count(*) as n from public.creations where created_at >= v_since group by 1),
  od as (select date_trunc('day', created_at) as d, count(*) as n, coalesce(sum(total), 0) as v from public.shop_orders where created_at >= v_since group by 1),
  rv as (select date_trunc('day', paid_at) as d, coalesce(sum(amount), 0) as v from public.orders where status = 'paid' and paid_at >= v_since group by 1),
  per_user as (
    select u.id,
      exists (select 1 from public.shops s where s.owner_id = u.id) as has_shop,
      exists (select 1 from public.shops s where s.owner_id = u.id and s.status = 'published') as published,
      exists (select 1 from public.shops s where s.owner_id = u.id and s.status = 'published'
                and (select count(*) from public.products p where p.shop_id = s.id and p.status in ('active', 'sold_out')) >= 3) as stocked,
      exists (select 1 from public.shops s join public.shop_events e on e.shop_id = s.id
                where s.owner_id = u.id and e.type = any(v_contacts)) as contacted,
      exists (select 1 from public.subscriptions sub where sub.user_id = u.id and sub.status = 'active' and sub.plan_key <> 'free'
                and sub.starts_at <= now() and sub.ends_at > now()) as paid
    from auth.users u
  ),
  listed as (select m.shop_id from public.market_shop_ids() m)
  select jsonb_build_object(
    'days', v_days,
    'since', v_since,
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', to_char(days.d, 'YYYY-MM-DD'),
               'signups', coalesce(su.n, 0),
               'shops_published', coalesce(sp.n, 0),
               'posters', coalesce(po.n, 0),
               'contacts', coalesce(ev.contacts, 0),
               'visits', coalesce(ev.visits, 0),
               'orders', coalesce(od.n, 0),
               'orders_value', coalesce(od.v, 0),
               'revenue', coalesce(rv.v, 0)
             ) order by days.d), '[]'::jsonb)
      from days
      left join ev on ev.d = days.d
      left join su on su.d = days.d
      left join sp on sp.d = days.d
      left join po on po.d = days.d
      left join od on od.d = days.d
      left join rv on rv.d = days.d
    ),
    'previous', jsonb_build_object(
      'signups', (select count(*) from auth.users where created_at >= v_prev and created_at < v_since),
      'shops_published', (select count(*) from public.shops where published_at >= v_prev and published_at < v_since),
      'posters', (select count(*) from public.creations where created_at >= v_prev and created_at < v_since),
      'contacts', (select count(*) from public.shop_events where type = any(v_contacts) and created_at >= v_prev and created_at < v_since),
      'visits', (select count(*) from public.shop_events where type = any(v_views) and created_at >= v_prev and created_at < v_since),
      'orders', (select count(*) from public.shop_orders where created_at >= v_prev and created_at < v_since),
      'revenue', (select coalesce(sum(amount), 0) from public.orders where status = 'paid' and paid_at >= v_prev and paid_at < v_since)
    ),
    'funnel', (
      select jsonb_build_object(
        'accounts', count(*),
        'shop', count(*) filter (where has_shop),
        'published', count(*) filter (where has_shop and published),
        'stocked', count(*) filter (where has_shop and published and stocked),
        'contacted', count(*) filter (where has_shop and published and stocked and contacted),
        'paid', count(*) filter (where has_shop and published and stocked and contacted and paid)
      ) from per_user
    ),
    'sources', (
      select coalesce(jsonb_agg(jsonb_build_object('source', src, 'count', n) order by n desc), '[]'::jsonb)
      from (
        select coalesce(source, 'direct') as src, count(*) as n
        from public.shop_events where type = any(v_contacts) and created_at >= v_since
        group by 1
      ) x
    ),
    'top_shops', (
      select coalesce(jsonb_agg(t order by t.contacts desc, t.visits desc), '[]'::jsonb)
      from (
        select s.id, s.name, s.slug, s.city,
               count(*) filter (where e.type = any(v_contacts)) as contacts,
               count(*) filter (where e.type = any(v_views)) as visits,
               (select count(*) from public.shop_orders o where o.shop_id = s.id and o.created_at >= v_since) as orders
        from public.shop_events e
        join public.shops s on s.id = e.shop_id
        where e.created_at >= v_since
        group by s.id
        order by 5 desc, 6 desc
        limit 8
      ) t
    ),
    'cities', (
      select coalesce(jsonb_agg(jsonb_build_object('city', c, 'count', n) order by n desc), '[]'::jsonb)
      from (
        select coalesce(nullif(initcap(btrim(city)), ''), 'Non précisée') as c, count(*) as n
        from public.shops where status = 'published' group by 1 order by 2 desc limit 6
      ) x
    ),
    'market', jsonb_build_object(
      'listed_shops', (select count(*) from listed),
      'visible_items', (select count(*) from public.products p
                         where p.shop_id in (select shop_id from listed) and p.status in ('active', 'sold_out')
                           and public.market_item_visible(p.id, p.subject_type)),
      'visits', (select count(*) from public.shop_events where source = 'market' and type = any(v_views) and created_at >= v_since),
      'contacts', (select count(*) from public.shop_events where source = 'market' and type = any(v_contacts) and created_at >= v_since)
    ),
    'orders', jsonb_build_object(
      'count', (select count(*) from public.shop_orders where created_at >= v_since),
      'value', (select coalesce(sum(total), 0) from public.shop_orders where created_at >= v_since),
      'avg_value', (select coalesce(round(avg(total)), 0) from public.shop_orders where created_at >= v_since),
      'avg_items', (select coalesce(round(avg(item_count), 1), 0) from public.shop_orders where created_at >= v_since),
      'shops', (select count(distinct shop_id) from public.shop_orders where created_at >= v_since)
    )
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.admin_dashboard(integer) from public, anon, authenticated;
grant execute on function public.admin_dashboard(integer) to service_role;
