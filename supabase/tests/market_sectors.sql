-- Vérifications de 0029 / 0030 : secteur vide accepté, auto & moto ouvert. Transaction annulée.
begin;
create or replace function pg_temp.expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'ÉCHEC : %', label; end if;
  raise notice 'OK : %', label;
end $$;
grant execute on function pg_temp.expect(boolean, text) to anon, authenticated, service_role;

update public.market_settings set launch_until = now() + interval '30 days', launch_min_items = 6;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000e1'), ('00000000-0000-0000-0000-0000000000e2'), ('00000000-0000-0000-0000-0000000000e3');
insert into public.shops (id, owner_id, slug, name, industry, city, whatsapp, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'sans-secteur', 'Sans secteur', null, 'Dakar', '+221770000011', 'published'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e2', 'pharma', 'Pharma', 'pharmacy', 'Dakar', '+221770000012', 'published'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e3', 'nouveau-secteur', 'Garage auto', 'automotive', 'Dakar', '+221770000013', 'published');
do $$
declare s record; i int; pid uuid;
begin
  for s in select id, owner_id, slug from public.shops where slug in ('sans-secteur', 'pharma', 'nouveau-secteur') loop
    for i in 1..6 loop
      insert into public.products (shop_id, owner_id, slug, name, price, status) values (s.id, s.owner_id, s.slug || '-p' || i, 'Article ' || i, 1000, 'active') returning id into pid;
      insert into public.product_images (product_id, owner_id, path, position) values (pid, s.owner_id, s.owner_id || '/p/' || pid || '.webp', 0);
    end loop;
  end loop;
end $$;

set local role anon;
select pg_temp.expect((select count(*) from public.market_shops() where slug = 'sans-secteur') = 1, 'secteur vide + 6 annonces : sur le Market');
select pg_temp.expect((select count(*) from public.market_shops() where slug = 'pharma') = 0, 'pharmacie : toujours écartée');
select pg_temp.expect((select count(*) from public.market_shops() where slug = 'nouveau-secteur') = 1, 'automobile (0030) : sur le Market');
select pg_temp.expect((select count(*) from public.market_products(p_shop => '00000000-0000-0000-0000-0000000000e1')) = 6, 'ses 6 annonces sont visibles');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select pg_temp.expect((public.my_market_status() ->> 'eligible_industry')::boolean, 'statut vendeur : secteur vide accepté');
select pg_temp.expect(public.my_market_status() ->> 'listed_via' = 'launch', 'statut vendeur : présent grâce à l''ouverture');
reset role;
rollback;
