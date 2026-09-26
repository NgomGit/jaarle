-- Vérifications de la monétisation (migration 0019). Transaction annulée : rien n'est conservé.
-- Rôles : « authenticated » = navigateur d'un commerçant ; « service_role » = serveur Jaarle.
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

-- ── Comptes : A (Awa), B (parrainée par A), C ─────────────────────────────────
insert into auth.users (id, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000aa01', '{"full_name": "Awa Diop"}');
do $$
declare v_code text;
begin
  select referral_code into v_code from public.account_profiles where user_id = '00000000-0000-0000-0000-00000000aa01';
  insert into auth.users (id, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000bb01', jsonb_build_object('full_name', 'Bineta Sow', 'ref', lower(v_code)));
  insert into auth.users (id, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000cc01', '{"full_name": "Cheikh", "ref": "flyer"}');
end $$;
create temp table ids as select
  '00000000-0000-0000-0000-00000000aa01'::uuid as a, '00000000-0000-0000-0000-00000000bb01'::uuid as b, '00000000-0000-0000-0000-00000000cc01'::uuid as c;
grant select on ids to anon, authenticated, service_role;

select pg_temp.expect((select count(*) = 3 from public.account_profiles where user_id in (select a from ids union select b from ids union select c from ids)), 'profil créé à l''inscription');
select pg_temp.expect((select referral_code ~ '^AWA[0-9]{3}$' from public.account_profiles where user_id = (select a from ids)), 'code de parrainage lisible (AWA123)');
select pg_temp.expect((select referred_by = (select a from ids) from public.account_profiles where user_id = (select b from ids)), 'B est rattachée à sa marraine A');
select pg_temp.expect((select referred_by is null and referral_source = 'flyer' from public.account_profiles where user_id = (select c from ids)), 'ref non reconnue gardée comme source');

-- Boutique publiée de A.
insert into public.shops (id, owner_id, slug, name, whatsapp, status)
values ('10000000-0000-0000-0000-0000000000a1', (select a from ids), 'bill-test-a', 'Awa Couture', '+221771234567', 'published');

-- ── Côté navigateur de A ─────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aa01';

select pg_temp.expect((public.get_my_entitlements() ->> 'plan_key') = 'free', 'A est en Gratuit par défaut');
select pg_temp.expect((public.get_my_entitlements() -> 'limits' ->> 'products') = '10', 'limite Gratuit : 10 produits');
select pg_temp.expect((public.get_my_entitlements() ->> 'used_generations') = '0', 'aucune génération consommée');

select pg_temp.expect_fail($$select public.consume_usage('00000000-0000-0000-0000-00000000aa01', 'poster_generate', -5)$$, 'le navigateur ne peut pas appeler consume_usage');
select pg_temp.expect_fail($$select public.grant_credits('00000000-0000-0000-0000-00000000aa01', 100, 'bonus')$$, 'le navigateur ne peut pas s''offrir des crédits');
select pg_temp.expect_fail($$select public.fulfill_order('x')$$, 'le navigateur ne peut pas activer une commande');
select pg_temp.expect_fail($$select public.billing_entitlements('00000000-0000-0000-0000-00000000bb01')$$, 'le navigateur ne peut pas lire les droits d''un autre');
select pg_temp.expect_fail($$select public.admin_metrics(30)$$, 'le navigateur ne peut pas lire les métriques admin');
select pg_temp.expect_fail($$insert into public.credit_ledger (user_id, delta, kind) values ('00000000-0000-0000-0000-00000000aa01', 100, 'bonus')$$, 'insertion directe dans credit_ledger refusée');
select pg_temp.expect_fail($$insert into public.subscriptions (user_id, plan_key, ends_at) values ('00000000-0000-0000-0000-00000000aa01', 'pro', now() + interval '1 year')$$, 'insertion directe d''un abonnement refusée');
select pg_temp.expect_fail($$insert into public.usage_events (user_id, action, units, source, plan_key, period_start) values ('00000000-0000-0000-0000-00000000aa01', 'studio_pack', -100, 'quota', 'free', date_trunc('month', now()))$$, 'insertion directe dans usage_events refusée');
update public.account_profiles set is_admin = true, is_founding = true where user_id = (select a from ids);
update public.plans set price_fcfa = 0 where key = 'pro';
select pg_temp.expect((select not is_admin and not is_founding from public.account_profiles where user_id = (select a from ids)), 'impossible de se déclarer admin / fondateur');
select pg_temp.expect((select price_fcfa = 2500 from public.plans where key = 'pro'), 'impossible de modifier les prix');

-- Commande forgée : forcée en « déblocage d'affiche », non payée.
insert into public.orders (user_id, ref_command, amount, status, kind, plan_key)
values ((select a from ids), 'FORGED-1', 1, 'paid', 'subscription', 'pro');
select pg_temp.expect((select kind = 'creation_unlock' and status = 'pending' and plan_key is null from public.orders where ref_command = 'FORGED-1'), 'commande d''abonnement forgée neutralisée');

-- Limite de produits (Gratuit : 10).
insert into public.products (shop_id, owner_id, slug, name, price)
select '10000000-0000-0000-0000-0000000000a1', (select a from ids), 'p-' || g, 'Produit ' || g, 1000 from generate_series(1, 10) g;
select pg_temp.expect_fail($$insert into public.products (shop_id, owner_id, slug, name) values ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000aa01', 'p-11', 'Produit 11')$$, '11e produit refusé en Gratuit');

-- ── Côté serveur : quota puis crédits ───────────────────────────────────────
reset role;
set local role service_role;
do $$
declare r jsonb; i int; v_a uuid := '00000000-0000-0000-0000-00000000aa01'; v_ev uuid;
begin
  for i in 1..5 loop
    r := public.consume_usage(v_a, 'poster_generate', 1);
    if r ->> 'source' <> 'quota' then raise exception 'ÉCHEC : génération % devrait venir du quota', i; end if;
  end loop;
  raise notice 'OK : 5 générations consommées sur le quota Gratuit';
  begin
    perform public.consume_usage(v_a, 'studio_pack', 1);
    raise exception 'ÉCHEC : la 6e génération aurait dû être refusée';
  exception when others then
    if sqlerrm not like 'LIMIT_REACHED%' then raise; end if;
    raise notice 'OK : 6e génération refusée (limite atteinte)';
  end;
  -- Les générations incluses (retouches) ne consomment rien.
  r := public.consume_usage(v_a, 'poster_regenerate', 0);
  if r ->> 'source' <> 'included' then raise exception 'ÉCHEC : retouche devrait être incluse'; end if;

  perform public.grant_credits(v_a, 2, 'bonus', 'Test');
  r := public.consume_usage(v_a, 'studio_pack', 1);
  if r ->> 'source' <> 'credits' then raise exception 'ÉCHEC : devrait consommer un crédit'; end if;
  v_ev := (r ->> 'event_id')::uuid;
  if (public.billing_entitlements(v_a) ->> 'credits')::int <> 1 then raise exception 'ÉCHEC : solde de crédits attendu 1'; end if;
  raise notice 'OK : crédit débité (solde 1)';
  begin
    perform public.consume_usage(v_a, 'poster_generate', 2);
    raise exception 'ÉCHEC : 2 crédits demandés pour un solde de 1';
  exception when others then
    if sqlerrm not like 'LIMIT_REACHED%' then raise; end if;
    raise notice 'OK : consommation au-delà du solde refusée';
  end;
  if not public.refund_usage(v_ev) then raise exception 'ÉCHEC : remboursement'; end if;
  if public.refund_usage(v_ev) then raise exception 'ÉCHEC : double remboursement accepté'; end if;
  if (public.billing_entitlements(v_a) ->> 'credits')::int <> 2 then raise exception 'ÉCHEC : solde après remboursement'; end if;
  raise notice 'OK : remboursement unique, solde revenu à 2';
  -- Un crédit ne peut pas débloquer si seules les sources « credits » sont autorisées et le solde suffit : OK ;
  r := public.consume_usage(v_a, 'poster_unlock', 1, array['credits']);
  if r ->> 'source' <> 'credits' then raise exception 'ÉCHEC : déblocage par crédit'; end if;
  raise notice 'OK : déblocage d''affiche payé en crédit';
end $$;

-- ── A ne voit que ses mouvements ; B ne voit rien de A ───────────────────────
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aa01';
select pg_temp.expect((select count(*) > 0 from public.credit_ledger), 'A voit son historique de crédits');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb01';
select pg_temp.expect((select count(*) = 0 from public.credit_ledger), 'B ne voit pas les crédits de A');
select pg_temp.expect((select count(*) = 0 from public.usage_events), 'B ne voit pas la consommation de A');
select pg_temp.expect((select count(*) = 0 from public.orders where ref_command = 'FORGED-1'), 'B ne voit pas les commandes de A');
select pg_temp.expect((select count(*) = 0 from public.promotions), 'codes promo illisibles depuis le navigateur');

-- ── Paiement Pro de A (serveur : commande + IPN) ────────────────────────────
reset role;
set local role service_role;
insert into public.orders (user_id, ref_command, amount, status, kind, plan_key)
values ((select a from ids), 'SUB-A-1', 2500, 'pending', 'subscription', 'pro');
select pg_temp.expect((public.fulfill_order('SUB-A-1', 'wave') ->> 'status') = 'fulfilled', 'paiement Pro exécuté');
select pg_temp.expect((public.fulfill_order('SUB-A-1', 'wave') ->> 'status') = 'noop', 'IPN rejouée : aucune double activation');
select pg_temp.expect((select count(*) = 1 from public.subscriptions where user_id = (select a from ids)), 'une seule période créée');
select pg_temp.expect((public.billing_entitlements((select a from ids)) ->> 'plan_key') = 'pro', 'A est Pro');
select pg_temp.expect((public.billing_entitlements((select a from ids)) -> 'limits' ->> 'products') is null, 'Pro : produits illimités');
select pg_temp.expect((public.billing_entitlements((select a from ids)) ->> 'used_generations') = '0', 'Pro : nouveau quota (0 / 15)');
select pg_temp.expect((public.billing_entitlements((select a from ids)) -> 'features' ->> 'watermark') = 'false', 'Pro : pas de filigrane');
-- Renouvellement anticipé : la période suivante commence à la fin de l'actuelle.
insert into public.orders (user_id, ref_command, amount, status, kind, plan_key)
values ((select a from ids), 'SUB-A-2', 2500, 'pending', 'subscription', 'pro');
select public.fulfill_order('SUB-A-2');
select pg_temp.expect((select max(ends_at) - min(starts_at) between interval '59 days' and interval '61 days' from public.subscriptions where user_id = (select a from ids)), 'renouvellement anticipé : 60 jours cumulés');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aa01';
insert into public.products (shop_id, owner_id, slug, name) values ('10000000-0000-0000-0000-0000000000a1', (select a from ids), 'p-11', 'Produit 11');
select pg_temp.expect(true, '11e produit accepté en Pro');
select pg_temp.expect((select count(*) = 2 from public.subscriptions), 'A voit ses abonnements');

-- ── Offre fondateur pour B ──────────────────────────────────────────────────
reset role;
set local role service_role;
select pg_temp.expect((public.billing_quote_plan((select b from ids), 'pro', 'fondateurs1500') ->> 'price') = '1500', 'code FONDATEURS1500 : 1 500 F');
select pg_temp.expect((public.billing_quote_plan((select b from ids), 'pro', 'FAUXCODE') ->> 'promo_error') = 'promo_invalid', 'code inconnu signalé');
select pg_temp.expect((public.billing_quote_plan((select b from ids), 'business', null) ->> 'error') = 'plan_unavailable', 'Business pas encore en vente');
insert into public.orders (user_id, ref_command, amount, status, kind, plan_key, promotion_id)
values ((select b from ids), 'SUB-B-1', 1500, 'pending', 'subscription', 'pro', (select id from public.promotions where code = 'FONDATEURS1500'));
select public.fulfill_order('SUB-B-1');
select pg_temp.expect((select is_founding from public.account_profiles where user_id = (select b from ids)), 'B devient « fondatrice »');
select pg_temp.expect((public.billing_quote_plan((select b from ids), 'pro', null) ->> 'periods_left') = '2', 'renouvellement : prix fondateur encore 2 mois');
insert into public.orders (user_id, ref_command, amount, status, kind, plan_key, promotion_id)
values ((select b from ids), 'SUB-B-2', 1500, 'pending', 'subscription', 'pro', (select id from public.promotions where code = 'FONDATEURS1500')),
       ((select b from ids), 'SUB-B-3', 1500, 'pending', 'subscription', 'pro', (select id from public.promotions where code = 'FONDATEURS1500'));
select public.fulfill_order('SUB-B-2');
select public.fulfill_order('SUB-B-3');
select pg_temp.expect((public.billing_quote_plan((select b from ids), 'pro', null) ->> 'price') = '2500', 'après 3 mois : retour au prix normal');
select pg_temp.expect((public.billing_quote_plan((select b from ids), 'pro', 'FONDATEURS1500') ->> 'promo_error') = 'promo_used', 'offre non réutilisable');
update public.promotions set max_redemptions = 1 where code = 'FONDATEURS1500';
select pg_temp.expect((public.billing_quote_plan((select c from ids), 'pro', 'FONDATEURS1500') ->> 'promo_error') = 'promo_full', 'nombre maximum de bénéficiaires respecté');

-- Crédits achetés.
insert into public.orders (user_id, ref_command, amount, status, kind, credit_pack_key)
values ((select c from ids), 'CRD-C-1', 1500, 'pending', 'credits', 'credits_5');
select public.fulfill_order('CRD-C-1');
select pg_temp.expect((public.billing_entitlements((select c from ids)) ->> 'credits') = '5', 'pack de 5 crédits ajouté');

-- Métriques admin (serveur).
select pg_temp.expect((public.admin_metrics(30) -> 'monetization' ->> 'pro_users')::int >= 2, 'métriques admin disponibles');

-- ── Public (anonyme) ────────────────────────────────────────────────────────
reset role;
set local role anon;
select pg_temp.expect((select count(*) = 3 from public.plans), 'plans lisibles sur /tarifs');
select pg_temp.expect((select count(*) from public.shops where slug = 'bill-test-a') = 1, 'boutique publique toujours accessible sans connexion');
select pg_temp.expect((public.shop_public_meta('10000000-0000-0000-0000-0000000000a1') ->> 'branding_badge') = 'false', 'boutique Pro : pas de mention Jaarle');
select pg_temp.expect((select count(*) from public.public_promotions()) >= 0, 'offres publiques lisibles');
select pg_temp.expect_fail($$select public.get_my_entitlements()$$, 'anonyme : pas de droits');
select pg_temp.expect((select count(*) = 0 from public.subscriptions), 'anonyme : abonnements illisibles');

rollback;
