-- Jaarle — Gestion des abonnements et crédits depuis l'admin (Comptes → fiche vendeur).
--
-- Les tables existent déjà (0019) : `subscriptions.source = 'admin'` et `credit_ledger.kind = 'admin'`.
-- Seul changement : quand plusieurs abonnements sont actifs en même temps, c'est la formule la plus
-- haute qui s'applique (avant : celle qui finissait le plus tard). Sans ça, un Business offert
-- 7 jours à un vendeur Pro payé jusqu'au mois prochain n'aurait aucun effet.
--
-- Script idempotent. À exécuter après 0038_shops_published_by_default.sql.

create or replace function public.billing_entitlements(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_plan public.plans%rowtype;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_used integer;
  v_credits integer;
  v_products integer;
  v_profile public.account_profiles%rowtype;
begin
  -- Plusieurs abonnements actifs en même temps (ex. Business offert 7 jours par l'admin pendant
  -- un Pro payé) : la formule la plus haute (plans.sort) s'applique, puis la plus longue. Quand
  -- l'offre temporaire se termine, l'abonnement payé reprend tout seul.
  select s.* into v_sub
  from public.subscriptions s
  join public.plans p on p.key = s.plan_key
  where s.user_id = p_user and s.status = 'active' and s.starts_at <= now() and s.ends_at > now()
  order by p.sort desc, s.ends_at desc
  limit 1;

  if v_sub.id is not null then
    select * into v_plan from public.plans where key = v_sub.plan_key;
    v_period_start := v_sub.starts_at;
    v_period_end := v_sub.ends_at;
  end if;
  if v_plan.key is null then
    select * into v_plan from public.plans where key = 'free';
    v_period_start := date_trunc('month', now());
    v_period_end := v_period_start + interval '1 month';
    v_sub := null;
  end if;

  select coalesce(sum(units), 0) into v_used
  from public.usage_events
  where user_id = p_user and source = 'quota' and period_start = v_period_start;

  select coalesce(sum(delta), 0) into v_credits from public.credit_ledger where user_id = p_user;
  select count(*) into v_products from public.products where owner_id = p_user;
  select * into v_profile from public.account_profiles where user_id = p_user;

  -- Abonnement le plus lointain (renouvellement anticipé) pour afficher « actif jusqu'au ».
  return jsonb_build_object(
    'plan_key', coalesce(v_plan.key, 'free'),
    'plan_name', coalesce(v_plan.name, 'Gratuit'),
    'price_fcfa', coalesce(v_plan.price_fcfa, 0),
    'limits', coalesce(v_plan.limits, '{}'::jsonb),
    'features', coalesce(v_plan.features, '{}'::jsonb),
    'subscription', case when v_sub.id is null then null else jsonb_build_object(
      'id', v_sub.id,
      'starts_at', v_sub.starts_at,
      'ends_at', v_sub.ends_at,
      'active_until', (select max(ends_at) from public.subscriptions s
                        where s.user_id = p_user and s.status = 'active' and s.plan_key = v_sub.plan_key and s.ends_at > now()),
      'source', v_sub.source
    ) end,
    'period_start', v_period_start,
    'period_end', v_period_end,
    'used_generations', v_used,
    'credits', v_credits,
    'products_count', v_products,
    'is_founding', coalesce(v_profile.is_founding, false),
    'is_admin', coalesce(v_profile.is_admin, false),
    'referral_code', v_profile.referral_code
  );
end;
$$;

revoke all on function public.billing_entitlements(uuid) from public, anon, authenticated;
grant execute on function public.billing_entitlements(uuid) to service_role;
