-- ─────────────────────────────────────────────────────────────────────────────
-- 0030 — Auto & moto sur Jaarle Market (à exécuter après 0029)
--
-- Le secteur « automotive » (vente de véhicules, pièces et accessoires auto, location de voitures)
-- entre sur le Market. Restent écartés : pharmacie, hôtellerie, voyage.
-- Catégories (lib/knowledge/category-tree.ts) : voitures, motos, utilitaires, pièces détachées,
-- pneus & jantes, accessoires auto, location de voiture.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Boutiques du Market
create or replace function public.market_shop_ids()
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
      -- Secteur vide accepté ; seuls pharmacie, hôtellerie et voyage restent hors du Market.
      and (s.industry is null or s.industry not in ('pharmacy', 'hotel', 'travel'))
  )
  select c.id, c.is_pro
  from cand c cross join cfg
  where (c.is_pro and c.n >= cfg.pro_min_items)
     or (cfg.launch_active and c.n >= cfg.launch_min_items);
$$;
revoke all on function public.market_shop_ids() from public, anon, authenticated;
grant execute on function public.market_shop_ids() to service_role;

-- 2. Statut Market du vendeur : même règle de secteur
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
    'eligible_industry', v_shop.industry is null or v_shop.industry not in ('pharmacy', 'hotel', 'travel'),
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
