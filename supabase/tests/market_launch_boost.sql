-- Vérifications de 0026 : ouverture du Market, badge PRO, mises en avant, suspension.
-- Transaction annulée : rien n'est conservé.
begin;

create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'OK (refusé comme prévu) : % [%]', label, sqlerrm; return; end;
  raise exception 'ÉCHEC : % aurait dû être refusé', label;
end $$;
create or replace function pg_temp.expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'ÉCHEC : %', label; end if;
  raise notice 'OK : %', label;
end $$;
grant execute on function pg_temp.expect_fail(text, text) to anon, authenticated, service_role;
grant execute on function pg_temp.expect(boolean, text) to anon, authenticated, service_role;

-- ── Boutiques ──────────────────────────────────────────────────────────────
-- P  : Pro, 4 annonces          → Market (règle Pro, 3 minimum)
-- F6 : Gratuit, 6 annonces      → Market pendant l'ouverture seulement
-- F5 : Gratuit, 5 annonces      → pas sur le Market (il en faut plus de 5)
-- S  : Gratuit, 7 annonces mais suspendue → jamais
-- X  : Gratuit, 7 annonces, secteur automobile → jamais
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2'), ('00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000a4'), ('00000000-0000-0000-0000-0000000000a5');
insert into public.subscriptions (user_id, plan_key, status, starts_at, ends_at, source)
values ('00000000-0000-0000-0000-0000000000a1', 'pro', 'active', now() - interval '1 day', now() + interval '29 days', 'admin');

insert into public.shops (id, owner_id, slug, name, industry, city, whatsapp, status) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 'pro-shop', 'Pro Shop', 'fashion', 'Dakar', '+221770000001', 'published'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a2', 'six-shop', 'Six Shop', 'beauty', 'Thiès', '+221770000002', 'published'),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000a3', 'five-shop', 'Five Shop', 'fashion', 'Dakar', '+221770000003', 'published'),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000a4', 'susp-shop', 'Susp Shop', 'fashion', 'Dakar', '+221770000004', 'published'),
  ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000a5', 'auto-shop', 'Auto Shop', 'automotive', 'Dakar', '+221770000005', 'published');

do $$
declare s record; i int; pid uuid; n int;
begin
  for s in select id, owner_id, slug from public.shops loop
    n := case s.slug when 'pro-shop' then 4 when 'six-shop' then 6 when 'five-shop' then 5 else 7 end;
    for i in 1..n loop
      insert into public.products (shop_id, owner_id, slug, name, price, status, market_category)
      values (s.id, s.owner_id, s.slug || '-p' || i, s.slug || ' article ' || i, 1000 * i, 'active', case when i = 1 then 'robes' else 'sacs-a-main' end)
      returning id into pid;
      insert into public.product_images (product_id, owner_id, path, position) values (pid, s.owner_id, s.owner_id || '/p/' || pid || '.webp', 0);
      -- Les plus petits numéros sont les plus récents (ordre « pertinence » prévisible).
      update public.products set updated_at = now() - (i || ' minutes')::interval where id = pid;
    end loop;
  end loop;
end $$;
update public.shops set status = 'suspended', suspended_at = now(), suspended_reason = 'test' where slug = 'susp-shop';

-- ── Réglages ───────────────────────────────────────────────────────────────
select pg_temp.expect((select count(*) from public.market_settings) = 1, 'une seule ligne de réglages');
select pg_temp.expect((select launch_until from public.market_settings) = '2026-12-01T00:00:00Z', 'ouverture jusqu''au 1er décembre 2026');
select pg_temp.expect_fail($$insert into public.market_settings (id) values (false)$$, 'pas de 2e ligne de réglages');
select pg_temp.expect_fail($$update public.market_settings set launch_min_items = 0$$, 'seuil d''ouverture invalide');
-- Pour le test : ouverture en cours quelle que soit la date d'exécution.
update public.market_settings set launch_until = now() + interval '30 days';

-- ── Visiteur : période d'ouverture ─────────────────────────────────────────
set local role anon;
select pg_temp.expect((public.market_public_settings() ->> 'launch_active')::boolean, 'réglages publics lisibles : ouverture en cours');
select pg_temp.expect((select count(*) from public.market_shops()) = 2, 'Market : la boutique Pro + celle de 6 annonces');
select pg_temp.expect((select string_agg(slug, ',' order by slug) from public.market_shops()) = 'pro-shop,six-shop', 'ni 5 annonces, ni suspendue, ni secteur fermé');
select pg_temp.expect((select slug from public.market_shops() limit 1) = 'pro-shop', 'boutiques du Market : Pro en premier');
select pg_temp.expect((select is_pro from public.market_shops() where slug = 'pro-shop'), 'is_pro vrai pour la boutique Pro');
select pg_temp.expect(not (select is_pro from public.market_shops() where slug = 'six-shop'), 'is_pro faux pour la boutique gratuite');
select pg_temp.expect((select count(*) from public.market_products()) = 10, '10 annonces (4 Pro + 6)');
select pg_temp.expect((select count(*) from (select * from public.market_products() limit 4) t where t.shop_slug = 'pro-shop') = 4,
  'pertinence : les 4 annonces Pro passent devant (3 places d''avance)');
select pg_temp.expect((select shop_slug from public.market_products() offset 4 limit 1) = 'six-shop', 'puis la boutique gratuite');
select pg_temp.expect((select shop_slug from public.market_products(p_sort => 'price_desc') limit 1) = 'six-shop', 'tri par prix : pas de remontée Pro');
select pg_temp.expect((select count(*) from public.shop_directory() where is_pro) = 1, 'annuaire : un seul badge PRO');
select pg_temp.expect((select count(*) from public.shop_directory() where listed) = 2, 'annuaire : 2 boutiques sur le Market');
select pg_temp.expect((select count(*) from public.shop_directory() where slug = 'susp-shop') = 0, 'annuaire : boutique suspendue absente');
select pg_temp.expect((select count(*) from public.market_pro_picks()) = 1, 'Sélection PRO : 1 annonce par boutique Pro');
select pg_temp.expect((select shop_slug from public.market_pro_picks()) = 'pro-shop', 'Sélection PRO : jamais une boutique gratuite');
select pg_temp.expect((select count(*) from public.market_banners()) = 0, 'aucune bannière programmée');
-- Tables internes : illisibles et non modifiables par le public.
select pg_temp.expect((select count(*) from public.market_boosts) = 0, 'anon ne lit pas market_boosts');
select pg_temp.expect((select count(*) from public.market_settings) = 0, 'anon ne lit pas market_settings');
select pg_temp.expect_fail($$insert into public.market_boosts (shop_id, placement, ends_at) values ('00000000-0000-0000-0000-0000000000f2', 'banner', now() + interval '1 day')$$, 'anon ne crée pas de mise en avant');
select pg_temp.expect_fail($$insert into public.admin_actions (action, target_type) values ('x', 'shop')$$, 'anon n''écrit pas dans le journal admin');
select pg_temp.expect_fail('select public.market_shop_ids()', 'market_shop_ids reste interne');
select pg_temp.expect_fail('select public.user_is_pro(''00000000-0000-0000-0000-0000000000a1'')', 'user_is_pro reste interne');
reset role;

-- ── Recherche (0028) ───────────────────────────────────────────────────────
update public.products set status = 'sold_out' where slug = 'pro-shop-p2';
set local role anon;
select pg_temp.expect((select count(*) from public.market_products(p_available => true)) = 9, 'filtre « disponible » : l''épuisé est écarté');
select pg_temp.expect((select count(*) from public.market_products()) = 10, 'sans filtre : l''épuisé reste visible');
select pg_temp.expect((select count(*) from public.market_products(p_q => 'Thiès')) = 6, 'recherche par ville de la boutique');
select pg_temp.expect((select count(*) from public.market_products(p_q => 'zzz', p_q_categories => array['robes'])) = 2, 'recherche : catégorie reconnue');
select pg_temp.expect((select count(*) from public.market_products(p_q => 'zzz')) = 0, 'recherche sans résultat');
reset role;
update public.products set status = 'active' where slug = 'pro-shop-p2';

-- ── Vendeurs ───────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect(public.my_market_status() ->> 'listed_via' = 'pro', 'P : présente grâce au Pro');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.expect(public.my_market_status() ->> 'listed_via' = 'launch', 'F6 : présente grâce à l''ouverture');
select pg_temp.expect((public.my_market_status() ->> 'launch_min_items')::int = 6, 'F6 : seuil d''ouverture transmis');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select pg_temp.expect(not (public.my_market_status() ->> 'listed')::boolean, 'F5 : pas encore sur le Market');
select pg_temp.expect((public.my_market_status() ->> 'products_with_photo')::int = 5, 'F5 : 5 annonces comptées');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
select pg_temp.expect((public.my_market_status() ->> 'suspended')::boolean, 'S : statut suspendu visible du vendeur');
update public.shops set status = 'published' where slug = 'susp-shop'; -- bloqué par la RLS (0 ligne)
reset role;
select pg_temp.expect((select status from public.shops where slug = 'susp-shop') = 'suspended', 'S toujours suspendue');

-- ── Mises en avant (admin = service_role) ──────────────────────────────────
set local role service_role;
insert into public.market_boosts (shop_id, product_id, placement, title, ends_at)
select '00000000-0000-0000-0000-0000000000f1', p.id, 'spotlight', null, now() + interval '7 days'
from public.products p where p.slug = 'pro-shop-p4';
insert into public.market_boosts (shop_id, product_id, placement, ends_at)
select '00000000-0000-0000-0000-0000000000f2', p.id, 'spotlight', now() + interval '7 days'
from public.products p where p.slug = 'six-shop-p6';
insert into public.market_boosts (shop_id, placement, title, subtitle, cta_label, ends_at) values
  ('00000000-0000-0000-0000-0000000000f1', 'banner', 'Promo Tabaski', '-20 % sur les robes', 'Voir la boutique', now() + interval '7 days'),
  ('00000000-0000-0000-0000-0000000000f2', 'banner', 'Bannière gratuite', null, null, now() + interval '7 days');
insert into public.market_boosts (shop_id, placement, title, starts_at, ends_at) values
  ('00000000-0000-0000-0000-0000000000f1', 'banner', 'Expirée', now() - interval '10 days', now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000000f1', 'banner', 'Programmée', now() + interval '1 day', now() + interval '8 days');
insert into public.market_boosts (shop_id, placement, title, ends_at, active) values
  ('00000000-0000-0000-0000-0000000000f1', 'banner', 'Désactivée', now() + interval '7 days', false);
select pg_temp.expect_fail($$insert into public.market_boosts (shop_id, product_id, placement, ends_at)
  select '00000000-0000-0000-0000-0000000000f1', p.id, 'banner', now() + interval '1 day' from public.products p where p.slug = 'six-shop-p1'$$,
  'produit d''une autre boutique refusé');
select pg_temp.expect_fail($$insert into public.market_boosts (shop_id, placement, ends_at) values ('00000000-0000-0000-0000-0000000000f1', 'popup', now() + interval '1 day')$$, 'emplacement inconnu refusé');
select pg_temp.expect_fail($$insert into public.market_boosts (shop_id, placement, starts_at, ends_at) values ('00000000-0000-0000-0000-0000000000f1', 'banner', now(), now() - interval '1 day')$$, 'dates incohérentes refusées');
insert into public.admin_actions (action, target_type, target_id) values ('shop.suspend', 'shop', '00000000-0000-0000-0000-0000000000f4');
select pg_temp.expect((select count(*) from public.admin_actions) = 1, 'journal admin écrit par le serveur');
reset role;

set local role anon;
select pg_temp.expect((select slug from public.market_products() limit 1) = 'pro-shop-p4', 'spotlight : l''annonce Pro passe en tête');
select pg_temp.expect((select boosted from public.market_products() limit 1), 'spotlight : marquée « à la une »');
select pg_temp.expect((select count(*) from public.market_products() where boosted) = 1, 'spotlight d''une boutique gratuite sans effet');
select pg_temp.expect((select count(*) from public.market_banners()) = 1, 'bannières : seulement l''active d''une boutique Pro');
select pg_temp.expect((select title from public.market_banners()) = 'Promo Tabaski', 'bannière Pro visible');
select pg_temp.expect((select media from public.market_banners()) is not null, 'bannière boutique : vignette fournie');
reset role;

-- Ciblage du spotlight : catégorie et ville.
update public.market_boosts set category_keys = array['chaussures'] where placement = 'spotlight' and shop_id = '00000000-0000-0000-0000-0000000000f1';
set local role anon;
select pg_temp.expect((select count(*) from public.market_products() where boosted) = 0, 'spotlight ciblé sur une autre catégorie : sans effet');
reset role;
update public.market_boosts set category_keys = array['sacs-a-main'], city = 'dakar' where placement = 'spotlight' and shop_id = '00000000-0000-0000-0000-0000000000f1';
set local role anon;
select pg_temp.expect((select count(*) from public.market_products() where boosted) = 1, 'spotlight ciblé sur sa catégorie et sa ville : actif');
reset role;

-- ── Fin de l'ouverture : seules les boutiques Pro restent ──────────────────
update public.market_settings set launch_until = now() - interval '1 second';
set local role anon;
select pg_temp.expect((select string_agg(slug, ',') from public.market_shops()) = 'pro-shop', 'après l''ouverture : Pro seulement');
select pg_temp.expect(not (public.market_public_settings() ->> 'launch_active')::boolean, 'ouverture terminée');
reset role;

-- ── Seuil modifiable : 5 annonces suffisent ────────────────────────────────
update public.market_settings set launch_until = now() + interval '1 day', launch_min_items = 5;
set local role anon;
select pg_temp.expect((select count(*) from public.market_shops()) = 3, 'seuil à 5 : la boutique de 5 annonces entre');
reset role;

-- ── Fin de l'abonnement Pro : bannière retirée automatiquement ─────────────
update public.subscriptions set ends_at = now() - interval '1 minute', starts_at = now() - interval '31 days'
where user_id = '00000000-0000-0000-0000-0000000000a1';
set local role anon;
select pg_temp.expect((select count(*) from public.market_banners()) = 0, 'plus Pro : plus de bannière');
select pg_temp.expect((select count(*) from public.market_products() where boosted) = 0, 'plus Pro : plus de remontée');
select pg_temp.expect((select count(*) from public.market_pro_picks()) = 0, 'plus Pro : hors Sélection PRO');
reset role;

rollback;
