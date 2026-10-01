-- ─────────────────────────────────────────────────────────────────────────────
-- 0021 — Règles du Market ajustées (à exécuter après 0020_market.sql)
--
-- On retire la condition « WhatsApp de la boutique = téléphone du compte confirmé » :
-- la confirmation SMS n'est pas active sur le projet, elle ne vérifiait donc rien, et elle
-- écartait des vendeurs Pro inscrits avec un numéro de connexion mal saisi.
-- Conditions restantes : boutique publiée, secteur « produits », abonnement payant actif,
-- au moins 3 produits en vente avec photo.
-- ─────────────────────────────────────────────────────────────────────────────

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
    and s.industry in ('fashion', 'beauty', 'grocery', 'agriculture', 'poissonnerie', 'furniture', 'electronics', 'artisanat')
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
  where p.shop_id = v_shop.id and p.status in ('active', 'sold_out')
    and exists (select 1 from public.product_images i where i.product_id = p.id);
  select count(*) into v_uncategorized from public.products p
  where p.shop_id = v_shop.id and p.status in ('active', 'sold_out') and p.market_category is null;
  return jsonb_build_object(
    'published', v_shop.status = 'published',
    'eligible_industry', coalesce(v_shop.industry in ('fashion', 'beauty', 'grocery', 'agriculture', 'poissonnerie', 'furniture', 'electronics', 'artisanat'), false),
    'pro', v_pro,
    'products_with_photo', v_ready,
    'uncategorized', v_uncategorized,
    'listed', v_shop.id in (select m.shop_id from public.market_shop_ids() m)
  );
end;
$$;
revoke all on function public.my_market_status() from public, anon;
grant execute on function public.my_market_status() to authenticated, service_role;
