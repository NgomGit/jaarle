-- Vérifications de Jaarle Market (migrations 0020 → 0023). Transaction annulée : rien n'est conservé.
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

-- ── Comptes ────────────────────────────────────────────────────────────────
-- A : Pro, WhatsApp = numéro du compte confirmé → sur le Market
-- B : Gratuit → annuaire seulement
-- C : Pro mais boutique non publiée → ni Market ni annuaire
-- (A a un numéro de connexion tronqué, différent de son WhatsApp : sans effet depuis 0021)
-- D : Pro mais secteur « automobile » → pas sur le Market
insert into auth.users (id, phone, phone_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', '2217700000', now()),
  ('00000000-0000-0000-0000-0000000000b1', '221770000002', now()),
  ('00000000-0000-0000-0000-0000000000c1', '221770000003', now()),
  ('00000000-0000-0000-0000-0000000000d1', '221770000004', now());

insert into public.subscriptions (user_id, plan_key, status, starts_at, ends_at, source)
select u, 'pro', 'active', now() - interval '1 day', now() + interval '29 days', 'admin'
from unnest(array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1']::uuid[]) u;

insert into public.shops (id, owner_id, slug, name, industry, city, district, whatsapp, status) values
  ('00000000-0000-0000-0000-00000000a5a5', '00000000-0000-0000-0000-0000000000a1', 'awa-couture', 'Awa Couture', 'fashion', 'Dakar', 'Sacré-Cœur', '+221770000001', 'published'),
  ('00000000-0000-0000-0000-00000000b5b5', '00000000-0000-0000-0000-0000000000b1', 'bineta-shop', 'Bineta Shop', 'fashion', 'Thiès', null, '+221770000002', 'published'),
  ('00000000-0000-0000-0000-00000000c5c5', '00000000-0000-0000-0000-0000000000c1', 'cheikh-mode', 'Cheikh Mode', 'fashion', 'Dakar', null, '+221770000003', 'draft'),
  ('00000000-0000-0000-0000-00000000d5d5', '00000000-0000-0000-0000-0000000000d1', 'dibi-resto', 'Auto Dakar', 'automotive', 'Dakar', null, '+221770000004', 'published');

-- 4 produits vendables par boutique (+ pour A : 1 brouillon, 1 sans photo, 1 épuisé)
do $$
declare s record; i int; pid uuid;
begin
  for s in select id, owner_id, slug from public.shops loop
    for i in 1..4 loop
      insert into public.products (shop_id, owner_id, slug, name, price, status, market_category)
      values (s.id, s.owner_id, s.slug || '-p' || i, 'Robe wax ' || i || case when i = 2 then ' 100% coton' else '' end, 10000 + i * 1000, 'active', case when i <= 3 then 'robes' else null end)
      returning id into pid;
      insert into public.product_images (product_id, owner_id, path, position) values (pid, s.owner_id, s.owner_id || '/products/' || pid || '.webp', 0);
    end loop;
  end loop;
  insert into public.products (shop_id, owner_id, slug, name, price, status, market_category)
  values ('00000000-0000-0000-0000-00000000a5a5', '00000000-0000-0000-0000-0000000000a1', 'brouillon', 'Brouillon', 1000, 'draft', 'robes');
  insert into public.products (shop_id, owner_id, slug, name, price, status, market_category)
  values ('00000000-0000-0000-0000-00000000a5a5', '00000000-0000-0000-0000-0000000000a1', 'sans-photo', 'Sans photo', 1000, 'active', 'robes');
  insert into public.products (shop_id, owner_id, slug, name, price, status, market_category)
  values ('00000000-0000-0000-0000-00000000a5a5', '00000000-0000-0000-0000-0000000000a1', 'epuise', 'Épuisé', 500, 'sold_out', 'robes') returning id into pid;
  insert into public.product_images (product_id, owner_id, path, position) values (pid, '00000000-0000-0000-0000-0000000000a1', 'x/epuise.webp', 0);
end $$;

select pg_temp.expect_fail($$update public.products set market_category = 'Robes Wax!' where slug = 'epuise'$$, 'catégorie Market au mauvais format');

-- ── Visiteur anonyme ───────────────────────────────────────────────────────
set local role anon;
select pg_temp.expect((select count(*) from public.market_products()) = 5, 'Market : les 4 produits de A + l''épuisé (ni brouillon, ni sans photo, ni autres boutiques)');
select pg_temp.expect((select bool_and(shop_slug = 'awa-couture') from public.market_products()), 'Market : uniquement la boutique Pro éligible (numéro de compte tronqué accepté)');
select pg_temp.expect((select m.status from public.market_products() with ordinality m order by m.ordinality desc limit 1) = 'sold_out', 'Tri par défaut : les épuisés en dernier');
select pg_temp.expect((select m.name from public.market_products(p_sort => 'price_asc') with ordinality m order by m.ordinality limit 1) = 'Épuisé', 'Tri prix croissant');
select pg_temp.expect((select count(*) from public.market_products(p_categories => array['robes'])) = 4, 'Filtre catégorie (3 classés + épuisé)');
select pg_temp.expect((select count(*) from public.market_products(p_city => 'dakar')) = 5, 'Filtre ville (slug)');
select pg_temp.expect((select count(*) from public.market_products(p_city => 'thies')) = 0, 'Ville sans boutique Pro');
select pg_temp.expect((select count(*) from public.market_products(p_q => '100%')) = 1, 'Recherche : % pris au pied de la lettre');
select pg_temp.expect((select count(*) from public.market_products(p_q => 'awa')) = 5, 'Recherche sur le nom de boutique');
select pg_temp.expect((select max(total_count) from public.market_products(p_limit => 2)) = 5, 'Pagination : total_count complet');
select pg_temp.expect((select count(*) from public.market_products(p_limit => 2, p_offset => 4)) = 1, 'Pagination : dernière page');
select pg_temp.expect((select count(*) from public.market_shops()) = 1, 'Boutiques du Market : A seulement');
select pg_temp.expect((select product_count from public.market_shops()) = 6, 'Compteur produits en vente de A (4 + sans photo + épuisé)');
select pg_temp.expect((select sum(products) from public.market_counts() where market_category = 'robes' and city = 'dakar') = 4, 'Comptages catégorie × ville');
select pg_temp.expect((select count(*) from public.shop_directory()) = 3, 'Annuaire : les boutiques publiées avec ≥ 3 produits (pas le brouillon)');
select pg_temp.expect((select slug from public.shop_directory() limit 1) = 'awa-couture', 'Annuaire : boutiques Pro du Market en premier');
select pg_temp.expect((select count(*) from public.shop_directory() where listed) = 1, 'Annuaire : badge PRO seulement pour A');
select pg_temp.expect_fail('select * from public.market_shop_ids()', 'anon ne lit pas la liste interne');
select pg_temp.expect((select count(*) from public.shop_reports) = 0, 'anon ne voit aucun signalement (RLS sans policy)');
select pg_temp.expect_fail($$insert into public.shop_reports (shop_id, reason) values ('00000000-0000-0000-0000-00000000a5a5', 'scam')$$, 'anon n''écrit pas de signalement directement');
select pg_temp.expect_fail('select public.my_market_status()', 'anon n''a pas de statut Market');
reset role;

-- ── Vendeurs connectés ─────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect((public.my_market_status() ->> 'listed')::boolean, 'A : sur le Market');
select pg_temp.expect((public.my_market_status() ->> 'uncategorized')::int = 1, 'A : 1 produit en vente sans catégorie Market');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.expect(not (public.my_market_status() ->> 'published')::boolean, 'C : boutique non publiée');
select pg_temp.expect(not (public.my_market_status() ->> 'listed')::boolean, 'C : pas sur le Market');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.expect(not (public.my_market_status() ->> 'pro')::boolean, 'B : pas Pro');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.expect(not (public.my_market_status() ->> 'eligible_industry')::boolean, 'D : secteur hors Market');
reset role;

-- ── Services : affichés avec leur affiche débloquée, jamais sans ──────────
insert into public.products (id, shop_id, owner_id, slug, name, price, status, subject_type, market_category)
values ('00000000-0000-0000-0000-0000000005e1', '00000000-0000-0000-0000-00000000a5a5', '00000000-0000-0000-0000-0000000000a1',
        'retouches', 'Retouches', 2000, 'active', 'service', 'retouches');
insert into public.product_images (product_id, owner_id, path, position)
values ('00000000-0000-0000-0000-0000000005e1', '00000000-0000-0000-0000-0000000000a1', 'x/retouches.webp', 0);
set local role anon;
select pg_temp.expect((select count(*) from public.market_products(p_type => 'service')) = 0, 'Service sans affiche : invisible (même avec une photo)');
reset role;
-- Affiche verrouillée (non payée) : toujours invisible
insert into public.creations (id, user_id, product_name, style, poster_path, unlocked, product_id)
values ('00000000-0000-0000-0000-00000000c0c1', '00000000-0000-0000-0000-0000000000a1', 'Retouches', 'auto', 'a1/poster-locked.jpg', false, '00000000-0000-0000-0000-0000000005e1');
set local role anon;
select pg_temp.expect((select count(*) from public.market_products(p_type => 'service')) = 0, 'Affiche non débloquée : service invisible');
reset role;
-- Affiche débloquée + une nouvelle version : la clé est celle de la dernière version
insert into public.creations (id, user_id, product_name, style, poster_path, unlocked, product_id)
values ('00000000-0000-0000-0000-00000000c0c2', '00000000-0000-0000-0000-0000000000a1', 'Retouches', 'auto', 'a1/poster.jpg', true, '00000000-0000-0000-0000-0000000005e1');
insert into public.creation_versions (id, creation_id, user_id, poster_path, kind, created_at)
values ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000c0c2', '00000000-0000-0000-0000-0000000000a1', 'a1/poster.jpg', 'principale', now() - interval '1 hour'),
       ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000c0c2', '00000000-0000-0000-0000-0000000000a1', 'a1/poster-v2.jpg', 'regeneration', now());
set local role anon;
select pg_temp.expect((select count(*) from public.market_products(p_type => 'service')) = 1, 'Service avec affiche débloquée : visible');
select pg_temp.expect((select poster_key from public.market_products(p_type => 'service')) = '00000000-0000-0000-0000-00000000f002', 'Clé = dernière version de l''affiche');
select pg_temp.expect((select image_path from public.market_products(p_type => 'service')) is null, 'Service : jamais la photo envoyée');
select pg_temp.expect((select count(*) from public.market_products(p_type => 'product')) = 5, 'Filtre produits seuls');
select pg_temp.expect((select count(*) from public.market_products()) = 6, 'Sans filtre : produits + services');
select pg_temp.expect((select count(*) from public.shop_service_posters('00000000-0000-0000-0000-00000000a5a5')) = 1, 'Vitrine : affiche du service accessible par sa clé');
select pg_temp.expect_fail('select public.product_poster_key(''00000000-0000-0000-0000-0000000005e1'')', 'anon n''appelle pas la fonction interne d''affiche');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect((public.my_market_status() ->> 'services_without_poster')::int = 0, 'A : aucun service sans affiche');
reset role;

-- ── Expiration de l'abonnement : A sort du Market immédiatement ────────────
update public.subscriptions set ends_at = now() - interval '1 minute', starts_at = now() - interval '31 days'
where user_id = '00000000-0000-0000-0000-0000000000a1';
set local role anon;
select pg_temp.expect((select count(*) from public.market_products()) = 0, 'Abonnement expiré : plus aucun produit sur le Market');
select pg_temp.expect((select count(*) from public.shop_directory()) = 3, 'Abonnement expiré : la boutique reste dans l''annuaire');
reset role;

-- ── Signalements (écrits par le serveur) ───────────────────────────────────
set local role service_role;
insert into public.shop_reports (shop_id, reason, details) values ('00000000-0000-0000-0000-00000000a5a5', 'scam', 'test');
select pg_temp.expect((select count(*) from public.shop_reports) = 1, 'service_role enregistre un signalement');
select pg_temp.expect_fail($$insert into public.shop_reports (shop_id, reason) values ('00000000-0000-0000-0000-00000000a5a5', 'autre')$$, 'motif inconnu refusé');
reset role;

rollback;
