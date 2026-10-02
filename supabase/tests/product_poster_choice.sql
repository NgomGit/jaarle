-- Vérifications de 0031 : choix de l'affiche d'une fiche. Transaction annulée.
begin;
create or replace function pg_temp.expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'ÉCHEC : %', label; end if;
  raise notice 'OK : %', label;
end $$;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000f1');
insert into public.shops (id, owner_id, slug, name, industry, city, whatsapp, status) values
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 'loc-auto', 'Loc Auto', 'automotive', 'Dakar', '+221770000099', 'published');
insert into public.products (id, shop_id, owner_id, slug, name, status, subject_type) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 'location', 'Location auto', 'active', 'service');

-- Deux affiches liées : A (ancienne, 2 versions), B (récente, débloquée) ; C non débloquée.
insert into public.creations (id, user_id, product_name, style, unlocked, poster_path, product_id, created_at) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', 'A', 'premium', true, 'u/a.png', '00000000-0000-0000-0000-0000000000f3', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f1', 'B', 'premium', true, 'u/b.png', '00000000-0000-0000-0000-0000000000f3', now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1', 'C', 'premium', false, 'u/c.png', '00000000-0000-0000-0000-0000000000f3', now());
insert into public.creation_versions (id, creation_id, user_id, kind, poster_path, created_at) values
  ('00000000-0000-0000-0000-00000000a0a1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', 'principale', 'u/a1.png', now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000a0a2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', 'regeneration', 'u/a2.png', now() - interval '47 hours');

select pg_temp.expect(public.product_poster_key('00000000-0000-0000-0000-0000000000f3') = '00000000-0000-0000-0000-0000000000b1', 'sans choix : la dernière affiche débloquée (B)');
update public.products set poster_key = '00000000-0000-0000-0000-00000000a0a1' where id = '00000000-0000-0000-0000-0000000000f3';
select pg_temp.expect(public.product_poster_key('00000000-0000-0000-0000-0000000000f3') = '00000000-0000-0000-0000-00000000a0a1', 'choix : la 1re version de A');
update public.products set poster_key = '00000000-0000-0000-0000-0000000000c1' where id = '00000000-0000-0000-0000-0000000000f3';
select pg_temp.expect(public.product_poster_key('00000000-0000-0000-0000-0000000000f3') = '00000000-0000-0000-0000-0000000000c1', 'choix non débloqué : affiché quand même (signé Jaarle)');
update public.products set poster_key = '00000000-0000-0000-0000-0000000000a1' where id = '00000000-0000-0000-0000-0000000000f3';
select pg_temp.expect(public.product_poster_key('00000000-0000-0000-0000-0000000000f3') = '00000000-0000-0000-0000-0000000000b1', 'id d''affiche qui a des versions : refusé, repli sur B');
update public.creations set product_id = null where id = '00000000-0000-0000-0000-0000000000b1';
update public.products set poster_key = '00000000-0000-0000-0000-0000000000b1' where id = '00000000-0000-0000-0000-0000000000f3';
select pg_temp.expect(public.product_poster_key('00000000-0000-0000-0000-0000000000f3') = '00000000-0000-0000-0000-00000000a0a2', 'affiche détachée : repli sur la dernière version de A');
update public.products set poster_key = '00000000-0000-0000-0000-000000000000' where id = '00000000-0000-0000-0000-0000000000f3';
select pg_temp.expect(public.product_poster_key('00000000-0000-0000-0000-0000000000f3') is null, 'affiche retirée : aucune (photo)');
update public.creations set unlocked = false where product_id = '00000000-0000-0000-0000-0000000000f3';
update public.products set poster_key = null where id = '00000000-0000-0000-0000-0000000000f3';
select pg_temp.expect(public.product_poster_key('00000000-0000-0000-0000-0000000000f3') = '00000000-0000-0000-0000-0000000000c1', 'aucune débloquée : la plus récente quand même');
rollback;
