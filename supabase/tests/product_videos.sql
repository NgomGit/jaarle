-- Vérification des migrations 0035 + 0036 (vidéo produit, réservée Pro) : unicité, contraintes,
-- RLS, stockage, masquage quand le vendeur repasse en Gratuit.
-- Tout se passe dans une transaction annulée à la fin : AUCUNE donnée n'est conservée.
-- Usage : sur une base de TEST (ou branche Supabase), coller dans le SQL Editor et exécuter.
-- Résultat attendu : une série de "OK ..." puis "TOUS LES TESTS VIDÉO SONT PASSÉS".

begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

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

-- A est Pro (abonnement actif), B est en Gratuit.
insert into public.subscriptions (user_id, plan_key, status, starts_at, ends_at, source)
values ('00000000-0000-0000-0000-00000000000a', 'pro', 'active', now() - interval '1 day', now() + interval '29 days', 'admin');

-- ── Données : boutique publiée de A, 1 produit actif, 1 brouillon ─────────────
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

insert into public.shops (id, owner_id, slug, name, whatsapp, status)
values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'awa-video', 'Awa Vidéo', '+221771234567', 'published');
insert into public.products (id, shop_id, owner_id, slug, name, price, status) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'boubou', 'Boubou', 25000, 'active'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'brouillon', 'Brouillon', 1000, 'draft');

-- Ajout d'une vidéo ≤ 30 s
insert into public.product_videos (product_id, owner_id, path, poster_path, duration_ms, file_size, width, height)
values ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-00000000000a/videos/30000000-0000-0000-0000-000000000001.mp4',
        '00000000-0000-0000-0000-00000000000a/videos/30000000-0000-0000-0000-000000000001.webp',
        30000, 8000000, 720, 1280);
select pg_temp.expect_count('select 1 from public.product_videos', 1, 'A ajoute une vidéo de 30 s');

select pg_temp.expect_fail($q$insert into public.product_videos (product_id, owner_id, path, duration_ms, file_size)
  values ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a',
          '00000000-0000-0000-0000-00000000000a/videos/30000000-0000-0000-0000-000000000002.mp4', 10000, 1000)$q$,
  'Deuxième vidéo sur le même produit');
select pg_temp.expect_fail($q$insert into public.product_videos (product_id, owner_id, path, duration_ms, file_size)
  values ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a',
          '00000000-0000-0000-0000-00000000000a/videos/30000000-0000-0000-0000-000000000003.mp4', 31000, 1000)$q$,
  'Vidéo de plus de 30 s');
select pg_temp.expect_fail($q$insert into public.product_videos (product_id, owner_id, path, duration_ms, file_size)
  values ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a',
          '00000000-0000-0000-0000-00000000000a/videos/30000000-0000-0000-0000-000000000003.mp4', 10000, 40000000)$q$,
  'Vidéo de plus de 30 Mo');
select pg_temp.expect_fail($q$insert into public.product_videos (product_id, owner_id, path, duration_ms, file_size, mime_type)
  values ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a',
          '00000000-0000-0000-0000-00000000000a/videos/30000000-0000-0000-0000-000000000003.mp4', 10000, 1000, 'video/quicktime')$q$,
  'Format non pris en charge (mov)');
select pg_temp.expect_fail($q$insert into public.product_videos (product_id, owner_id, path, duration_ms, file_size)
  values ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a',
          '00000000-0000-0000-0000-00000000000b/videos/30000000-0000-0000-0000-000000000003.mp4', 10000, 1000)$q$,
  'Chemin dans le dossier d''un autre vendeur');

-- Vidéo du brouillon (exactement 30 s, avec la marge d'encodage)
insert into public.product_videos (product_id, owner_id, path, duration_ms, file_size)
values ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-00000000000a/videos/30000000-0000-0000-0000-000000000004.mp4', 30400, 5000000);

-- Remplacement (même ligne, nouveau fichier)
update public.product_videos
   set path = '00000000-0000-0000-0000-00000000000a/videos/30000000-0000-0000-0000-000000000005.mp4', duration_ms = 12000
 where product_id = '20000000-0000-0000-0000-00000000000a';
select pg_temp.expect_count($q$select 1 from public.product_videos where duration_ms = 12000$q$, 1, 'A remplace sa vidéo');
reset role;

-- ── Vendeur B ───────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_count('select 1 from public.product_videos', 1, 'B ne voit que la vidéo publique de A (pas celle du brouillon)');
select pg_temp.expect_fail($q$insert into public.product_videos (product_id, owner_id, path, duration_ms, file_size)
  values ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b',
          '00000000-0000-0000-0000-00000000000b/videos/30000000-0000-0000-0000-000000000006.mp4', 10000, 1000)$q$,
  'B ajoute une vidéo au produit de A');
update public.product_videos set duration_ms = 1000;
delete from public.product_videos;
select pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name)
  values ('product-videos', '00000000-0000-0000-0000-00000000000a/videos/30000000-0000-0000-0000-000000000007.mp4')$q$,
  'B dépose un fichier dans le dossier vidéo de A');
select pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name)
  values ('product-videos', '00000000-0000-0000-0000-00000000000b/videos/30000000-0000-0000-0000-000000000008.mp4')$q$,
  'B (Gratuit) dépose une vidéo dans son propre dossier');
select pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name)
  values ('product-videos', '00000000-0000-0000-0000-00000000000b/autre/fichier.mp4')$q$,
  'Fichier hors du dossier videos/');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect_count($q$select 1 from public.product_videos where duration_ms = 12000$q$, 1, 'Vidéo de A intacte après tentative de B');
select pg_temp.expect_count('select 1 from public.product_videos', 2, 'A voit ses 2 vidéos (dont brouillon)');
reset role;

-- ── Visiteur anonyme ────────────────────────────────────────────────────────
set local role anon;
set local request.jwt.claim.sub = '';
select pg_temp.expect_count('select 1 from public.product_videos', 1, 'Anonyme : vidéo du produit publié seulement');
select pg_temp.expect_fail($q$insert into public.product_videos (product_id, owner_id, path, duration_ms, file_size)
  values ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a',
          '00000000-0000-0000-0000-00000000000a/videos/30000000-0000-0000-0000-000000000009.mp4', 10000, 1000)$q$,
  'Anonyme écrit une vidéo');
select pg_temp.expect_count($q$select 1 from storage.objects where bucket_id = 'product-videos'$q$, 0, 'Anonyme ne liste pas le bucket');
reset role;

-- ── Produit masqué → plus visible ───────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update public.products set status = 'hidden' where id = '20000000-0000-0000-0000-00000000000a';
reset role;
set local role anon;
select pg_temp.expect_count('select 1 from public.product_videos', 0, 'Produit masqué : vidéo invisible');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update public.products set status = 'active' where id = '20000000-0000-0000-0000-00000000000a';
reset role;

-- ── Boutique suspendue ──────────────────────────────────────────────────────
set local role service_role;
update public.shops set status = 'suspended' where id = '10000000-0000-0000-0000-00000000000a';
reset role;
set local role anon;
select pg_temp.expect_count('select 1 from public.product_videos', 0, 'Boutique suspendue : vidéo invisible');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect_fail($q$update public.product_videos set duration_ms = 5000
  where product_id = '20000000-0000-0000-0000-00000000000a'$q$, 'A modifie sa vidéo pendant la suspension');
reset role;
set local role service_role;
update public.shops set status = 'published' where id = '10000000-0000-0000-0000-00000000000a';
reset role;

-- ── Fin de l'abonnement Pro de A : vidéos masquées, ajout refusé ─────────────
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into storage.objects (bucket_id, name)
values ('product-videos', '00000000-0000-0000-0000-00000000000a/videos/30000000-0000-0000-0000-00000000000a.mp4');
reset role;
update public.subscriptions set ends_at = now() - interval '1 hour', starts_at = now() - interval '31 days'
 where user_id = '00000000-0000-0000-0000-00000000000a';
set local role anon;
select pg_temp.expect_count('select 1 from public.product_videos', 0, 'Vendeur redevenu Gratuit : vidéo masquée du public');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect_count('select 1 from public.product_videos', 2, 'A (Gratuit) voit toujours ses vidéos dans son tableau de bord');
select pg_temp.expect_fail($q$update public.product_videos
  set path = '00000000-0000-0000-0000-00000000000a/videos/30000000-0000-0000-0000-00000000000b.mp4'
  where product_id = '20000000-0000-0000-0000-00000000000a'$q$, 'A (Gratuit) remplace sa vidéo');
select pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name)
  values ('product-videos', '00000000-0000-0000-0000-00000000000a/videos/30000000-0000-0000-0000-00000000000c.mp4')$q$,
  'A (Gratuit) dépose une nouvelle vidéo');
update public.product_videos set poster_path = null where product_id = '20000000-0000-0000-0000-00000000000a';
select pg_temp.expect_count($q$select 1 from public.product_videos where poster_path is null and product_id = '20000000-0000-0000-0000-00000000000a'$q$,
  1, 'A (Gratuit) peut encore modifier l''aperçu');
reset role;
-- Retour en Pro : la vidéo réapparaît
insert into public.subscriptions (user_id, plan_key, status, starts_at, ends_at, source)
values ('00000000-0000-0000-0000-00000000000a', 'pro', 'active', now() - interval '1 minute', now() + interval '30 days', 'payment');
set local role anon;
select pg_temp.expect_count('select 1 from public.product_videos', 1, 'Repassé Pro : vidéo de nouveau visible');
reset role;

-- ── Suppression ─────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
delete from public.product_videos where product_id = '20000000-0000-0000-0000-00000000000b';
select pg_temp.expect_count('select 1 from public.product_videos', 1, 'A supprime une vidéo');
delete from public.products where id = '20000000-0000-0000-0000-00000000000a';
select pg_temp.expect_count('select 1 from public.product_videos', 0, 'Suppression du produit : vidéo supprimée (cascade)');
reset role;

-- ── Statistiques ────────────────────────────────────────────────────────────
set local role service_role;
insert into public.shop_events (shop_id, type) values ('10000000-0000-0000-0000-00000000000a', 'product_video_play');
reset role;
select pg_temp.expect_count($q$select 1 from public.shop_events where type = 'product_video_play'$q$, 1, 'Événement product_video_play accepté');

do $$ begin raise notice 'TOUS LES TESTS VIDÉO SONT PASSÉS'; end $$;

rollback;
