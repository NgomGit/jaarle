-- Vérification RLS du Studio Marketing (migration 0017). Transaction annulée : rien n'est conservé.
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1');

create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'OK (refusé comme prévu) : %', label; return; end;
  raise exception 'ÉCHEC : % aurait dû être refusé', label;
end $$;
create or replace function pg_temp.expect_count(sql text, expected int, label text) returns void language plpgsql as $$
declare n int;
begin
  execute 'select count(*) from (' || sql || ') q' into n;
  if n <> expected then raise exception 'ÉCHEC : % — attendu %, obtenu %', label, expected, n; end if;
  raise notice 'OK : % (%)', label, n;
end $$;
grant execute on function pg_temp.expect_fail(text, text) to anon, authenticated;
grant execute on function pg_temp.expect_count(text, int, text) to anon, authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into public.shops (id, owner_id, slug, name, whatsapp)
values ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'studio-test-a', 'Studio A', '+221771234567');
insert into public.products (id, shop_id, owner_id, slug, name, price)
values ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'p', 'Produit', 1000);
insert into public.marketing_packs (id, shop_id, product_id, owner_id, objective)
values ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'sell');
insert into public.marketing_posts (id, pack_id, owner_id, platform, format, variants)
values ('40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'instagram_feed', 'square', '[{"caption":"x"}]');
select public.marketing_post_track('40000000-0000-0000-0000-0000000000a1', 'copy');
select pg_temp.expect_count($q$select 1 from public.marketing_posts where copy_count = 1$q$, 1, 'Compteur de copie incrémenté');
-- 0027 : partages comptés à part des téléchargements.
select public.marketing_post_track('40000000-0000-0000-0000-0000000000a1', 'share');
select pg_temp.expect_count($q$select 1 from public.marketing_posts where share_count = 1 and last_shared_at is not null and download_count = 0$q$, 1, 'Compteur de partage incrémenté (0027)');
select pg_temp.expect_fail($q$insert into public.marketing_packs (shop_id, owner_id, objective)
  values ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'promo')$q$, 'Objectif promo sans offre décrite');
select pg_temp.expect_fail($q$insert into public.marketing_posts (pack_id, owner_id, platform, format)
  values ('30000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'instagram_feed', 'square')$q$, 'Deux posts pour la même plateforme dans un pack');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.expect_count('select 1 from public.marketing_packs', 0, 'B ne voit pas les packs de A');
select pg_temp.expect_count('select 1 from public.marketing_posts', 0, 'B ne voit pas les posts de A');
select pg_temp.expect_fail($q$insert into public.marketing_packs (shop_id, owner_id, objective)
  values ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'sell')$q$, 'B crée un pack sur la boutique de A');
select public.marketing_post_track('40000000-0000-0000-0000-0000000000a1', 'download');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect_count($q$select 1 from public.marketing_posts where download_count = 0$q$, 1, 'B ne peut pas incrémenter les compteurs de A');
reset role;

set local role anon;
select pg_temp.expect_count('select 1 from public.marketing_posts', 0, 'Anonyme ne voit aucun contenu');
select pg_temp.expect_fail($q$select public.marketing_post_track('40000000-0000-0000-0000-0000000000a1', 'copy')$q$, 'Anonyme appelle marketing_post_track');
reset role;

do $$ begin raise notice 'TOUS LES TESTS RLS STUDIO SONT PASSÉS'; end $$;
rollback;
