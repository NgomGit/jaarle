-- Vérification des règles RLS de la migration 0015 (boutiques / produits / photos / événements).
-- Tout se passe dans une transaction annulée à la fin : AUCUNE donnée n'est conservée.
-- Usage : sur une base de TEST (ou branche Supabase), coller dans le SQL Editor et exécuter.
-- Résultat attendu : une série de "OK ..." puis "TOUS LES TESTS RLS SONT PASSÉS". Toute erreur = échec.

begin;

-- Deux commerçants fictifs
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

-- Helper : exécute une requête et vérifie qu'elle échoue
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'OK (refusé comme prévu) : %', label;
    return;
  end;
  raise exception 'ÉCHEC : % aurait dû être refusé', label;
end $$;

create or replace function pg_temp.expect_count(sql text, expected int, label text) returns void language plpgsql as $$
declare n int;
begin
  execute 'select count(*) from (' || sql || ') q' into n;
  if n <> expected then
    raise exception 'ÉCHEC : % — attendu %, obtenu %', label, expected, n;
  end if;
  raise notice 'OK : % (%)', label, n;
end $$;

grant execute on function pg_temp.expect_fail(text, text) to anon, authenticated;
grant execute on function pg_temp.expect_count(text, int, text) to anon, authenticated;

-- ── Utilisateur A ──────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

insert into public.shops (id, owner_id, slug, name, whatsapp)
values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'awa-couture', 'Awa Couture', '+221771234567');

select pg_temp.expect_fail($q$insert into public.shops (owner_id, slug, name, whatsapp)
  values ('00000000-0000-0000-0000-00000000000a', 'awa-bis', 'Awa Bis', '+221771234567')$q$,
  'A crée une 2e boutique (1 boutique par compte)');
select pg_temp.expect_fail($q$insert into public.shops (owner_id, slug, name, whatsapp)
  values ('00000000-0000-0000-0000-00000000000b', 'usurpation', 'Faux', '+221771234567')$q$,
  'A crée une boutique au nom de B');
select pg_temp.expect_fail($q$update public.shops set status = 'suspended' where slug = 'awa-couture'$q$,
  'A se suspend / manipule le statut de modération');

insert into public.products (id, shop_id, owner_id, slug, name, price)
values ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-00000000000a', 'boubou-bleu', 'Boubou homme bleu', 25000);

insert into public.product_images (product_id, owner_id, path, position)
select '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a',
       '00000000-0000-0000-0000-00000000000a/products/p' || g || '.webp', g
from generate_series(0, 3) g;
select pg_temp.expect_fail($q$insert into public.product_images (product_id, owner_id, path, position)
  values ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'x/5.webp', 3)$q$,
  '5e photo sur un produit');

select pg_temp.expect_count('select 1 from public.shops', 1, 'A voit sa boutique brouillon');
select pg_temp.expect_count($q$select 1 from public.shop_events$q$, 0, 'A lit ses événements (aucun)');
reset role;

-- ── Utilisateur B ──────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';

select pg_temp.expect_count('select 1 from public.shops', 0, 'B ne voit pas la boutique brouillon de A');
select pg_temp.expect_count('select 1 from public.products', 0, 'B ne voit pas les produits d''une boutique brouillon');
select pg_temp.expect_fail($q$insert into public.products (shop_id, owner_id, slug, name)
  values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'intrus', 'Intrus')$q$,
  'B ajoute un produit dans la boutique de A');
select pg_temp.expect_count($q$select 1 from (select public.is_shop_slug_available('awa-couture') as ok) s where not ok$q$,
  1, 'Slug de A signalé indisponible à B malgré la RLS');

-- B tente de modifier / supprimer : 0 ligne touchée (RLS), vérifié ensuite côté A
update public.shops set name = 'Piraté' where slug = 'awa-couture';
delete from public.products where slug = 'boubou-bleu';
reset role;

-- ── Publication par A ───────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect_count($q$select 1 from public.shops where name = 'Awa Couture'$q$, 1, 'Nom de A intact après tentative de B');
select pg_temp.expect_count($q$select 1 from public.products$q$, 1, 'Produit de A intact après tentative de B');
update public.shops set status = 'published' where slug = 'awa-couture';
select pg_temp.expect_count($q$select 1 from public.shops where published_at is not null$q$, 1, 'published_at renseigné à la publication');
insert into public.products (shop_id, owner_id, slug, name, status)
values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'cache', 'Produit caché', 'hidden');
reset role;

-- ── Visiteur anonyme ────────────────────────────────────────────────────────
set local role anon;
set local request.jwt.claim.sub = '';
select pg_temp.expect_count('select 1 from public.shops', 1, 'Anonyme voit la boutique publiée');
select pg_temp.expect_count('select 1 from public.products', 1, 'Anonyme voit le produit actif mais pas le caché');
select pg_temp.expect_count('select 1 from public.product_images', 4, 'Anonyme voit les photos du produit actif');
select pg_temp.expect_count('select 1 from public.shop_events', 0, 'Anonyme ne lit aucun événement');
select pg_temp.expect_fail($q$insert into public.shop_events (shop_id, type)
  values ('10000000-0000-0000-0000-00000000000a', 'shop_view')$q$, 'Anonyme écrit un événement directement');
select pg_temp.expect_fail($q$insert into public.shops (owner_id, slug, name, whatsapp)
  values ('00000000-0000-0000-0000-00000000000a', 'anon-shop', 'Anon', '+221771234567')$q$, 'Anonyme crée une boutique');
select pg_temp.expect_fail($q$select public.is_shop_slug_available('x')$q$, 'Anonyme appelle is_shop_slug_available');
reset role;

-- ── Modération : boutique suspendue (action admin, service_role) ─────────────
set local role service_role;
update public.shops set status = 'suspended' where slug = 'awa-couture';
reset role;

set local role anon;
select pg_temp.expect_count('select 1 from public.shops', 0, 'Boutique suspendue invisible au public');
select pg_temp.expect_count('select 1 from public.products', 0, 'Produits d''une boutique suspendue invisibles');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update public.shops set status = 'published' where slug = 'awa-couture';
select pg_temp.expect_count($q$select 1 from public.shops where status = 'suspended'$q$, 1, 'A ne peut pas lever sa propre suspension');
select pg_temp.expect_fail($q$insert into public.products (shop_id, owner_id, slug, name)
  values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'nouveau', 'Nouveau')$q$,
  'A ajoute un produit à une boutique suspendue');
reset role;

-- ── Stockage shop-media ─────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into storage.objects (bucket_id, name) values ('shop-media', '00000000-0000-0000-0000-00000000000b/shops/logo.webp');
select pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name)
  values ('shop-media', '00000000-0000-0000-0000-00000000000a/shops/logo.webp')$q$, 'B écrit dans le dossier de A');
reset role;

-- ── Contraintes de données ──────────────────────────────────────────────────
select pg_temp.expect_fail($q$insert into public.shops (owner_id, slug, name, whatsapp)
  values ('00000000-0000-0000-0000-00000000000b', 'admin', 'Admin', '+221771234567')$q$, 'Slug réservé');
select pg_temp.expect_fail($q$insert into public.shops (owner_id, slug, name, whatsapp)
  values ('00000000-0000-0000-0000-00000000000b', 'a--b', 'Double', '+221771234567')$q$, 'Slug avec double tiret');
select pg_temp.expect_fail($q$insert into public.shops (owner_id, slug, name, whatsapp)
  values ('00000000-0000-0000-0000-00000000000b', 'numero-faux', 'Faux num', '77 123 45 67')$q$, 'WhatsApp hors format E.164');
select pg_temp.expect_fail($q$insert into public.creations (user_id, product_name, style, format)
  values ('00000000-0000-0000-0000-00000000000a', 'Test', 'auto', 'poster-a3')$q$, 'Format de création inconnu');
insert into public.creations (user_id, product_name, style)
values ('00000000-0000-0000-0000-00000000000a', 'Création existante', 'auto');
select pg_temp.expect_count($q$select 1 from public.creations where format = 'square' and shop_id is null and product_id is null$q$,
  1, 'Création sans boutique : comportement actuel (square, liens nuls)');

do $$ begin raise notice 'TOUS LES TESTS RLS SONT PASSÉS'; end $$;

rollback;
