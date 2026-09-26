-- Vérification du Studio à partir des affiches (migration 0018). Transaction annulée : rien n'est conservé.
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000d1');

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

-- Deux affiches (une par utilisateur), créées comme le fait le générateur (service_role).
insert into public.creations (id, user_id, product_name, price, style, photo_path) values
  ('40000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'Robe wax', 15000, 'moderne', 'x/a.jpg'),
  ('40000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'Sac', null, 'moderne', 'x/b.jpg');
insert into public.creation_versions (id, creation_id, user_id, poster_path, kind) values
  ('50000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'x/a1.jpg', 'principale'),
  ('50000000-0000-0000-0000-0000000000d1', '40000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'x/b1.jpg', 'principale');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';

-- C (sans boutique) peut créer un pack à partir de SON affiche.
insert into public.marketing_packs (id, owner_id, creation_id, creation_version_id, objective)
values ('60000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1',
        '40000000-0000-0000-0000-0000000000c1', '50000000-0000-0000-0000-0000000000c1', 'sell');
insert into public.marketing_posts (pack_id, owner_id, platform, format, variants)
values ('60000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'tiktok', 'story', '[]');
select pg_temp.expect_count('select 1 from public.marketing_packs where creation_id is not null', 1, 'C voit son pack affiche');

select pg_temp.expect_fail($$insert into public.marketing_packs (owner_id, creation_id, objective)
  values ('00000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000d1', 'sell')$$,
  'pack sur l''affiche d''un autre');
select pg_temp.expect_fail($$insert into public.marketing_packs (owner_id, creation_id, creation_version_id, objective)
  values ('00000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000c1', '50000000-0000-0000-0000-0000000000d1', 'sell')$$,
  'version d''une autre affiche');
select pg_temp.expect_fail($$insert into public.marketing_packs (owner_id, objective)
  values ('00000000-0000-0000-0000-0000000000c1', 'sell')$$,
  'pack sans source (ni affiche ni produit)');
select pg_temp.expect_fail($$update public.marketing_packs set creation_id = '40000000-0000-0000-0000-0000000000d1'
  where id = '60000000-0000-0000-0000-0000000000c1'$$,
  'détourner son pack vers l''affiche d''un autre');

-- D ne voit rien du pack de C.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.expect_count('select 1 from public.marketing_packs', 0, 'D ne voit pas les packs de C');
select pg_temp.expect_count('select 1 from public.marketing_posts', 0, 'D ne voit pas les posts de C');

-- Suppression de l'affiche → pack supprimé (cascade).
reset role;
delete from public.creations where id = '40000000-0000-0000-0000-0000000000c1';
select pg_temp.expect_count($$select 1 from public.marketing_packs where id = '60000000-0000-0000-0000-0000000000c1'$$, 0, 'pack supprimé avec l''affiche');

rollback;
