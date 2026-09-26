-- Jaarle 2.0 — Monétisation : plans (Gratuit / Pro / Business), droits (entitlements), quotas de
-- générations, crédits (registre append-only), abonnements « paiement → 30 jours » via PayTech,
-- offres promotionnelles (FONDATEURS1500), parrainage, statut « fondateur », mesure des coûts IA et
-- métriques admin.
--
-- Principes :
--  * Les PRIX, LIMITES et FONCTIONNALITÉS vivent dans la table `plans` (modifiable sans déploiement).
--  * Les utilisateurs ne peuvent RIEN écrire dans les tables de facturation : consommation, crédits
--    et activations passent par des fonctions `security definer` exécutables uniquement par le
--    serveur (service_role), avec un verrou par utilisateur (pas de double consommation).
--  * Le paiement « à l'affiche » existant (orders.kind = 'creation_unlock') reste inchangé.
--  * Aucune table du générateur d'affiches n'est modifiée (seulement `orders`, en ajoutant des
--    colonnes facultatives, et la contrainte de types de `shop_events` pour les clics « Appeler »).
--
-- Script idempotent. À exécuter après 0018_studio_from_creations.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Utilitaire : la requête vient-elle d'un utilisateur final (API publique) ?
--    (SQL Editor / service_role → non : ces rôles peuvent administrer librement.)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.billing_is_end_user()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('role', true), '') in ('authenticated', 'anon');
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Plans (source de vérité des prix / limites / fonctionnalités)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.plans (
  key text primary key,
  name text not null,
  tagline text,
  price_fcfa integer not null default 0,
  period_days integer not null default 30,
  sort integer not null default 0,
  is_public boolean not null default true,        -- affiché sur /tarifs
  is_purchasable boolean not null default true,   -- false = « bientôt disponible »
  limits jsonb not null default '{}'::jsonb,      -- products (null = illimité), monthly_generations
  features jsonb not null default '{}'::jsonb,    -- voir lib/billing/entitlements.ts
  highlights text[] not null default '{}',        -- arguments affichés sur /tarifs
  updated_at timestamptz not null default now(),
  constraint plans_key_format check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  constraint plans_price_positive check (price_fcfa >= 0),
  constraint plans_period_positive check (period_days between 1 and 366)
);

insert into public.plans (key, name, tagline, price_fcfa, period_days, sort, is_public, is_purchasable, limits, features, highlights)
values
  ('free', 'Gratuit', 'Pour découvrir Jaarle et lancer ta boutique', 0, 30, 0, true, true,
   '{"products": 10, "monthly_generations": 5}'::jsonb,
   '{"watermark": true, "branding_badge": true, "analytics": "basic", "studio": true, "poster_unlock_included": false, "content_calendar": false, "priority_support": false, "reports": false, "multi_users": false}'::jsonb,
   array['Ta boutique en ligne avec lien et QR code', 'Jusqu''à 10 produits', 'Bouton WhatsApp pour recevoir les commandes', '5 générations IA par mois (affiches, publications)', 'Statistiques des 7 derniers jours']),
  ('pro', 'Pro', 'Pour vendre plus chaque semaine', 2500, 30, 1, true, true,
   '{"products": null, "monthly_generations": 15}'::jsonb,
   '{"watermark": false, "branding_badge": false, "analytics": "advanced", "studio": true, "poster_unlock_included": true, "content_calendar": true, "priority_support": false, "reports": false, "multi_users": false}'::jsonb,
   array['Produits illimités', '15 générations IA par mois', 'Affiches HD sans filigrane', 'Publications Instagram, Facebook, TikTok, Story et Statut WhatsApp', 'Textes, hashtags et variantes', 'Statistiques détaillées (30 jours, sources, produits)']),
  ('business', 'Business', 'Pour les boutiques qui publient tous les jours', 5000, 30, 2, true, false,
   '{"products": null, "monthly_generations": 40}'::jsonb,
   '{"watermark": false, "branding_badge": false, "analytics": "advanced", "studio": true, "poster_unlock_included": true, "content_calendar": true, "priority_support": true, "reports": true, "multi_users": false}'::jsonb,
   array['Tout ce qu''il y a dans Pro', '40 générations IA par mois', 'Rapports et fonctions marketing avancées', 'Support prioritaire'])
on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Profils de compte : parrainage, statut fondateur, admin
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  referral_code text not null,
  referred_by uuid references auth.users(id) on delete set null,
  referral_source text,                 -- ref non reconnue comme code (ex. « boutique », « flyer »)
  is_founding boolean not null default false,
  founding_since timestamptz,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  constraint account_profiles_code_key unique (referral_code),
  constraint account_profiles_code_format check (referral_code ~ '^[A-Z0-9]{4,20}$'),
  constraint account_profiles_not_self check (referred_by is null or referred_by <> user_id),
  constraint account_profiles_source_length check (referral_source is null or char_length(referral_source) <= 40)
);

create index if not exists account_profiles_referred_by_idx on public.account_profiles(referred_by) where referred_by is not null;

create or replace function public.generate_referral_code(p_name text)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  base text;
  code text;
  i integer := 0;
begin
  base := upper(translate(coalesce(split_part(btrim(coalesce(p_name, '')), ' ', 1), ''),
    'àâäáãéèêëíìîïóòôöõúùûüçñÀÂÄÁÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'));
  base := left(regexp_replace(base, '[^A-Z0-9]', '', 'g'), 10);
  if char_length(base) < 3 then base := 'JAARLE'; end if;
  loop
    code := base || lpad(floor(random() * 1000)::int::text, 3, '0');
    exit when not exists (select 1 from public.account_profiles where referral_code = code);
    i := i + 1;
    if i > 30 then
      code := base || upper(substr(md5(random()::text), 1, 6));
      exit;
    end if;
  end loop;
  return code;
end;
$$;

-- Création automatique du profil à l'inscription (ref transmise dans les métadonnées d'inscription).
create or replace function public.handle_new_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text := upper(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'ref', '')), ''));
  v_referrer uuid;
begin
  if v_ref is not null then
    select user_id into v_referrer from public.account_profiles where referral_code = v_ref;
  end if;
  insert into public.account_profiles (user_id, referral_code, referred_by, referral_source)
  values (
    new.id,
    public.generate_referral_code(new.raw_user_meta_data ->> 'full_name'),
    case when v_referrer is not null and v_referrer <> new.id then v_referrer end,
    case when v_referrer is null and v_ref is not null then left(lower(regexp_replace(v_ref, '[^A-Za-z0-9_-]', '', 'g')), 40) end
  )
  on conflict (user_id) do nothing;
  return new;
exception when others then
  -- L'inscription ne doit JAMAIS échouer à cause du parrainage.
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_jaarle on auth.users;
create trigger on_auth_user_created_jaarle
  after insert on auth.users
  for each row execute function public.handle_new_account();

-- Profils des comptes existants.
insert into public.account_profiles (user_id, referral_code)
select u.id, public.generate_referral_code(u.raw_user_meta_data ->> 'full_name')
from auth.users u
where not exists (select 1 from public.account_profiles p where p.user_id = u.id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Abonnements (périodes payées de 30 jours, renouvellement manuel)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_key text not null references public.plans(key),
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  source text not null default 'payment',
  order_id uuid,
  promotion_id uuid,
  price_paid integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  constraint subscriptions_status_check check (status in ('active', 'canceled', 'refunded')),
  constraint subscriptions_source_check check (source in ('payment', 'promotion', 'admin', 'bonus')),
  constraint subscriptions_dates_check check (ends_at > starts_at)
);

create index if not exists subscriptions_user_idx on public.subscriptions(user_id, ends_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Packs de crédits, registre de crédits (append-only), consommation (quota)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.credit_packs (
  key text primary key,
  name text not null,
  credits integer not null,
  price_fcfa integer not null,
  expires_days integer,                -- null = pas d'expiration
  sort integer not null default 0,
  is_active boolean not null default true,
  constraint credit_packs_credits_positive check (credits > 0),
  constraint credit_packs_price_positive check (price_fcfa > 0)
);

insert into public.credit_packs (key, name, credits, price_fcfa, expires_days, sort) values
  ('credits_5', '5 crédits', 5, 1500, 180, 1),
  ('credits_15', '15 crédits', 15, 3500, 180, 2),
  ('credits_30', '30 crédits', 30, 6000, 365, 3)
on conflict (key) do nothing;

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  kind text not null,
  usage_event_id uuid,
  order_id uuid,
  note text,
  expires_at timestamptz,               -- pour les crédits ajoutés (expiration traitée par un job : mouvement « expiration »)
  created_at timestamptz not null default now(),
  constraint credit_ledger_delta_nonzero check (delta <> 0),
  constraint credit_ledger_kind_check check (kind in ('purchase', 'generation', 'bonus', 'refund', 'promotion', 'expiration', 'admin'))
);

create index if not exists credit_ledger_user_idx on public.credit_ledger(user_id, created_at desc);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  units integer not null,               -- négatif pour un remboursement (refund_of renseigné)
  source text not null,                 -- quota | credits | included
  plan_key text not null,
  period_start timestamptz not null,    -- période de quota à laquelle l'événement est imputé
  refund_of uuid references public.usage_events(id),
  creation_id uuid,
  pack_id uuid,
  shop_id uuid,
  meta jsonb,
  created_at timestamptz not null default now(),
  constraint usage_events_source_check check (source in ('quota', 'credits', 'included')),
  constraint usage_events_action_check check (action in (
    'poster_generate', 'poster_regenerate', 'poster_declination', 'poster_unlock',
    'studio_pack', 'studio_regenerate', 'product_autofill'
  )),
  constraint usage_events_refund_key unique (refund_of)
);

create index if not exists usage_events_user_period_idx on public.usage_events(user_id, period_start);
create index if not exists usage_events_created_idx on public.usage_events(created_at);

-- Coûts IA (estimés ou réels) — écrits par le serveur uniquement.
create table if not exists public.ai_calls (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  usage_event_id uuid,
  shop_id uuid,
  creation_id uuid,
  feature text not null,
  model text,
  input_tokens integer,
  output_tokens integer,
  images integer,
  est_cost_usd numeric(10, 5) not null default 0,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_calls_created_idx on public.ai_calls(created_at);
create index if not exists ai_calls_user_idx on public.ai_calls(user_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Offres promotionnelles (ex. FONDATEURS1500)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text,                            -- facultatif (offre sans code possible)
  name text not null,
  description text,
  plan_key text not null references public.plans(key),
  promo_price_fcfa integer not null,
  duration_periods integer not null default 1,   -- nombre de mois au prix promotionnel
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer,              -- nombre maximum de bénéficiaires (null = illimité)
  founders_only boolean not null default false,  -- réservé aux comptes « fondateurs »
  grants_founding boolean not null default false, -- en profiter rend le compte « fondateur »
  show_on_pricing boolean not null default false, -- affichée sur /tarifs
  show_code boolean not null default false,       -- code affiché publiquement sur /tarifs
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint promotions_code_format check (code is null or code ~ '^[A-Z0-9_-]{3,30}$'),
  constraint promotions_price_positive check (promo_price_fcfa > 0),
  constraint promotions_duration_positive check (duration_periods between 1 and 24)
);

create unique index if not exists promotions_code_key on public.promotions(code) where code is not null;

create table if not exists public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  periods_used integer not null default 0,
  first_order_id uuid,
  last_order_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotion_redemptions_unique unique (promotion_id, user_id)
);

insert into public.promotions (code, name, description, plan_key, promo_price_fcfa, duration_periods, starts_at, ends_at, max_redemptions, grants_founding, show_on_pricing, show_code)
select 'FONDATEURS1500', 'Offre de lancement', 'Jaarle Pro à 1 500 FCFA/mois pendant 3 mois pour les premiers commerçants.',
       'pro', 1500, 3, now(), '2026-12-31 23:59:59+00', 50, true, true, true
where not exists (select 1 from public.promotions where code = 'FONDATEURS1500');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Commandes : nouveaux types (abonnement, crédits) — le paiement à l'affiche reste inchangé
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.orders
  add column if not exists kind text not null default 'creation_unlock',
  add column if not exists plan_key text,
  add column if not exists credit_pack_key text,
  add column if not exists promotion_id uuid,
  add column if not exists fulfilled_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_kind_check') then
    alter table public.orders add constraint orders_kind_check check (kind in ('creation_unlock', 'subscription', 'credits'));
  end if;
end;
$$;

-- Un utilisateur peut toujours créer sa commande « déblocage d'affiche » (flux existant), mais ne
-- peut ni créer une commande d'abonnement/crédits (réservé au serveur), ni une commande déjà payée.
create or replace function public.orders_guard_insert()
returns trigger
language plpgsql
as $$
begin
  if public.billing_is_end_user() then
    new.kind := 'creation_unlock';
    new.plan_key := null;
    new.credit_pack_key := null;
    new.promotion_id := null;
    new.status := 'pending';
    new.paid_at := null;
    new.fulfilled_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_guard_insert on public.orders;
create trigger orders_guard_insert
  before insert on public.orders
  for each row execute function public.orders_guard_insert();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Suivi des appels (KPI « contact client ») : type d'événement call_click
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.shop_events drop constraint if exists shop_events_type_check;
alter table public.shop_events add constraint shop_events_type_check check (type in (
  'shop_view', 'product_view', 'whatsapp_click', 'share_click', 'qr_scan', 'order_click', 'call_click'
));

create index if not exists shop_events_contact_idx on public.shop_events(created_at, shop_id)
  where type in ('whatsapp_click', 'call_click', 'order_click');

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RLS : lecture de ses propres données uniquement, AUCUNE écriture côté utilisateur
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.plans enable row level security;
alter table public.credit_packs enable row level security;
alter table public.account_profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.usage_events enable row level security;
alter table public.ai_calls enable row level security;
alter table public.promotions enable row level security;
alter table public.promotion_redemptions enable row level security;

drop policy if exists "plans_read_all" on public.plans;
create policy "plans_read_all" on public.plans for select to anon, authenticated using (true);

drop policy if exists "credit_packs_read_active" on public.credit_packs;
create policy "credit_packs_read_active" on public.credit_packs for select to anon, authenticated using (is_active);

drop policy if exists "account_profiles_select_own" on public.account_profiles;
create policy "account_profiles_select_own" on public.account_profiles for select to authenticated using (user_id = auth.uid());

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions for select to authenticated using (user_id = auth.uid());

drop policy if exists "credit_ledger_select_own" on public.credit_ledger;
create policy "credit_ledger_select_own" on public.credit_ledger for select to authenticated using (user_id = auth.uid());

drop policy if exists "usage_events_select_own" on public.usage_events;
create policy "usage_events_select_own" on public.usage_events for select to authenticated using (user_id = auth.uid());

drop policy if exists "promotion_redemptions_select_own" on public.promotion_redemptions;
create policy "promotion_redemptions_select_own" on public.promotion_redemptions for select to authenticated using (user_id = auth.uid());
-- promotions et ai_calls : aucune policy → illisibles depuis le navigateur (codes, coûts).

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Droits (entitlements)
-- ─────────────────────────────────────────────────────────────────────────────
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
  select * into v_sub
  from public.subscriptions
  where user_id = p_user and status = 'active' and starts_at <= now() and ends_at > now()
  order by ends_at desc
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

-- Version « moi » : utilisable par le navigateur / le serveur avec la session de l'utilisateur.
create or replace function public.get_my_entitlements()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when auth.uid() is null then null else public.billing_entitlements(auth.uid()) end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Limite de produits appliquée EN BASE (impossible à contourner depuis le navigateur)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.products_enforce_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit text;
  v_count integer;
begin
  if not public.billing_is_end_user() then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('products:' || new.owner_id::text, 0));
  v_limit := public.billing_entitlements(new.owner_id) -> 'limits' ->> 'products';
  if v_limit is null then
    return new;
  end if;
  select count(*) into v_count from public.products where owner_id = new.owner_id;
  if v_count >= v_limit::integer then
    raise exception 'LIMIT_REACHED:products' using errcode = 'P0001', hint = v_limit;
  end if;
  return new;
end;
$$;

drop trigger if exists products_enforce_plan_limit on public.products;
create trigger products_enforce_plan_limit
  before insert on public.products
  for each row execute function public.products_enforce_plan_limit();

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Consommation (quota puis crédits), remboursement, crédits — SERVEUR UNIQUEMENT
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.consume_usage(
  p_user uuid,
  p_action text,
  p_units integer,
  p_sources text[] default array['quota', 'credits'],
  p_creation uuid default null,
  p_pack uuid default null,
  p_shop uuid default null,
  p_meta jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ent jsonb;
  v_limit text;
  v_used integer;
  v_credits integer;
  v_source text;
  v_id uuid;
begin
  if p_user is null then
    raise exception 'Utilisateur manquant' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('billing:' || p_user::text, 0));
  v_ent := public.billing_entitlements(p_user);

  if coalesce(p_units, 0) <= 0 then
    v_source := 'included';
  else
    v_limit := v_ent -> 'limits' ->> 'monthly_generations';
    v_used := (v_ent ->> 'used_generations')::integer;
    v_credits := (v_ent ->> 'credits')::integer;
    if 'quota' = any(p_sources) and (v_limit is null or v_limit::integer - v_used >= p_units) then
      v_source := 'quota';
    elsif 'credits' = any(p_sources) and v_credits >= p_units then
      v_source := 'credits';
    else
      raise exception 'LIMIT_REACHED:generations' using errcode = 'P0001';
    end if;
  end if;

  insert into public.usage_events (user_id, action, units, source, plan_key, period_start, creation_id, pack_id, shop_id, meta)
  values (p_user, p_action, greatest(coalesce(p_units, 0), 0), v_source, v_ent ->> 'plan_key',
          (v_ent ->> 'period_start')::timestamptz, p_creation, p_pack, p_shop, p_meta)
  returning id into v_id;

  if v_source = 'credits' then
    insert into public.credit_ledger (user_id, delta, kind, usage_event_id, note)
    values (p_user, -p_units, 'generation', v_id, p_action);
  end if;

  return jsonb_build_object('event_id', v_id, 'source', v_source, 'plan_key', v_ent ->> 'plan_key');
end;
$$;

-- Rembourse une consommation (génération échouée). Une seule fois par événement.
create or replace function public.refund_usage(p_event uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev public.usage_events%rowtype;
  v_id uuid;
begin
  select * into v_ev from public.usage_events where id = p_event;
  if v_ev.id is null or v_ev.units <= 0 or v_ev.refund_of is not null then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('billing:' || v_ev.user_id::text, 0));
  if exists (select 1 from public.usage_events where refund_of = v_ev.id) then
    return false;
  end if;
  insert into public.usage_events (user_id, action, units, source, plan_key, period_start, refund_of, creation_id, pack_id, shop_id)
  values (v_ev.user_id, v_ev.action, -v_ev.units, v_ev.source, v_ev.plan_key, v_ev.period_start, v_ev.id, v_ev.creation_id, v_ev.pack_id, v_ev.shop_id)
  returning id into v_id;
  if v_ev.source = 'credits' then
    insert into public.credit_ledger (user_id, delta, kind, usage_event_id, note)
    values (v_ev.user_id, v_ev.units, 'refund', v_id, 'Génération échouée');
  end if;
  return true;
end;
$$;

create or replace function public.grant_credits(
  p_user uuid,
  p_delta integer,
  p_kind text,
  p_note text default null,
  p_order uuid default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_kind not in ('purchase', 'bonus', 'promotion', 'admin', 'refund', 'expiration') then
    raise exception 'Type de mouvement invalide : %', p_kind using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('billing:' || p_user::text, 0));
  insert into public.credit_ledger (user_id, delta, kind, order_id, note, expires_at)
  values (p_user, p_delta, p_kind, p_order, p_note, p_expires_at)
  returning id into v_id;
  return v_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Prix d'un abonnement (avec promotion) et exécution d'une commande payée
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.billing_quote_plan(p_user uuid, p_plan text, p_code text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan public.plans%rowtype;
  v_promo public.promotions%rowtype;
  v_red public.promotion_redemptions%rowtype;
  v_count integer;
  v_founding boolean;
  v_error text;
begin
  select * into v_plan from public.plans where key = p_plan;
  if v_plan.key is null or not v_plan.is_purchasable or v_plan.price_fcfa <= 0 then
    return jsonb_build_object('ok', false, 'error', 'plan_unavailable');
  end if;

  -- 1) Offre déjà commencée et pas terminée : appliquée automatiquement au renouvellement.
  select r.* into v_red
  from public.promotion_redemptions r
  join public.promotions p on p.id = r.promotion_id
  where r.user_id = p_user and p.plan_key = p_plan and p.is_active and r.periods_used < p.duration_periods
  order by r.created_at desc
  limit 1;
  if v_red.id is not null then
    select * into v_promo from public.promotions where id = v_red.promotion_id;
    return jsonb_build_object('ok', true, 'plan_key', p_plan, 'price', v_promo.promo_price_fcfa, 'regular_price', v_plan.price_fcfa,
      'period_days', v_plan.period_days, 'promotion_id', v_promo.id, 'promotion_name', v_promo.name,
      'periods_left', v_promo.duration_periods - v_red.periods_used);
  end if;

  -- 2) Code saisi.
  if nullif(btrim(coalesce(p_code, '')), '') is not null then
    select * into v_promo from public.promotions where code = upper(btrim(p_code));
    if v_promo.id is null or not v_promo.is_active or v_promo.plan_key <> p_plan then
      v_error := 'promo_invalid';
    elsif (v_promo.starts_at is not null and v_promo.starts_at > now()) or (v_promo.ends_at is not null and v_promo.ends_at <= now()) then
      v_error := 'promo_expired';
    else
      select count(*) into v_count from public.promotion_redemptions where promotion_id = v_promo.id;
      select coalesce(is_founding, false) into v_founding from public.account_profiles where user_id = p_user;
      if v_promo.max_redemptions is not null and v_count >= v_promo.max_redemptions then
        v_error := 'promo_full';
      elsif v_promo.founders_only and not coalesce(v_founding, false) then
        v_error := 'promo_founders_only';
      elsif exists (select 1 from public.promotion_redemptions where promotion_id = v_promo.id and user_id = p_user) then
        v_error := 'promo_used';
      end if;
    end if;
    if v_error is null then
      return jsonb_build_object('ok', true, 'plan_key', p_plan, 'price', v_promo.promo_price_fcfa, 'regular_price', v_plan.price_fcfa,
        'period_days', v_plan.period_days, 'promotion_id', v_promo.id, 'promotion_name', v_promo.name,
        'periods_left', v_promo.duration_periods);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'plan_key', p_plan, 'price', v_plan.price_fcfa, 'regular_price', v_plan.price_fcfa,
    'period_days', v_plan.period_days, 'promotion_id', null, 'promo_error', v_error);
end;
$$;

-- Exécute une commande PAYÉE (appelée par l'IPN après vérification de la signature PayTech).
-- Idempotent : seule la transition pending → paid déclenche l'activation.
create or replace function public.fulfill_order(p_ref text, p_payment_method text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_plan public.plans%rowtype;
  v_pack public.credit_packs%rowtype;
  v_promo public.promotions%rowtype;
  v_start timestamptz;
  v_sub uuid;
begin
  update public.orders
     set status = 'paid', paid_at = now(), payment_method = coalesce(p_payment_method, payment_method)
   where ref_command = p_ref and status = 'pending'
   returning * into v_order;
  if v_order.id is null then
    return jsonb_build_object('ok', true, 'status', 'noop');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('billing:' || v_order.user_id::text, 0));

  if v_order.kind = 'subscription' then
    select * into v_plan from public.plans where key = v_order.plan_key;
    if v_plan.key is null then
      raise exception 'Plan inconnu pour la commande %', p_ref;
    end if;
    -- Renouvellement anticipé : la nouvelle période commence à la fin de la période en cours.
    select greatest(now(), coalesce(max(ends_at), now())) into v_start
    from public.subscriptions
    where user_id = v_order.user_id and plan_key = v_order.plan_key and status = 'active' and ends_at > now();
    insert into public.subscriptions (user_id, plan_key, status, starts_at, ends_at, source, order_id, promotion_id, price_paid)
    values (v_order.user_id, v_order.plan_key, 'active', v_start, v_start + make_interval(days => v_plan.period_days),
            case when v_order.promotion_id is null then 'payment' else 'promotion' end,
            v_order.id, v_order.promotion_id, v_order.amount)
    returning id into v_sub;

    if v_order.promotion_id is not null then
      insert into public.promotion_redemptions (promotion_id, user_id, periods_used, first_order_id, last_order_id)
      values (v_order.promotion_id, v_order.user_id, 1, v_order.id, v_order.id)
      on conflict (promotion_id, user_id) do update
        set periods_used = public.promotion_redemptions.periods_used + 1, last_order_id = excluded.last_order_id, updated_at = now();
      select * into v_promo from public.promotions where id = v_order.promotion_id;
      if v_promo.grants_founding then
        insert into public.account_profiles (user_id, referral_code, is_founding, founding_since)
        values (v_order.user_id, public.generate_referral_code(null), true, now())
        on conflict (user_id) do update set is_founding = true, founding_since = coalesce(public.account_profiles.founding_since, now());
      end if;
    end if;

  elsif v_order.kind = 'credits' then
    select * into v_pack from public.credit_packs where key = v_order.credit_pack_key;
    if v_pack.key is null then
      raise exception 'Pack inconnu pour la commande %', p_ref;
    end if;
    insert into public.credit_ledger (user_id, delta, kind, order_id, note, expires_at)
    values (v_order.user_id, v_pack.credits, 'purchase', v_order.id, v_pack.name,
            case when v_pack.expires_days is null then null else now() + make_interval(days => v_pack.expires_days) end);

  elsif v_order.kind = 'creation_unlock' and v_order.creation_id is not null then
    update public.creations set unlocked = true where id = v_order.creation_id;
  end if;

  update public.orders set fulfilled_at = now() where id = v_order.id;
  return jsonb_build_object('ok', true, 'status', 'fulfilled', 'kind', v_order.kind, 'subscription_id', v_sub);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. Infos publiques d'une boutique (mention « Créé avec Jaarle » + code de parrainage du
--     propriétaire pour la boucle virale), offres affichées sur /tarifs
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.shop_public_meta(p_shop uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_ent jsonb;
begin
  select owner_id into v_owner from public.shops where id = p_shop and status = 'published';
  if v_owner is null then
    return null;
  end if;
  v_ent := public.billing_entitlements(v_owner);
  return jsonb_build_object(
    'branding_badge', coalesce((v_ent -> 'features' ->> 'branding_badge')::boolean, true),
    'referral_code', v_ent ->> 'referral_code'
  );
end;
$$;

create or replace function public.public_promotions()
returns table (name text, description text, plan_key text, promo_price_fcfa integer, duration_periods integer, ends_at timestamptz, spots_left integer, code text)
language sql
stable
security definer
set search_path = public
as $$
  select p.name, p.description, p.plan_key, p.promo_price_fcfa, p.duration_periods, p.ends_at,
         case when p.max_redemptions is null then null
              else greatest(p.max_redemptions - (select count(*) from public.promotion_redemptions r where r.promotion_id = p.id), 0)::integer end,
         case when p.show_code then p.code end
  from public.promotions p
  where p.is_active and p.show_on_pricing
    and (p.starts_at is null or p.starts_at <= now())
    and (p.ends_at is null or p.ends_at > now())
  order by p.created_at;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. Métriques admin (acquisition, activation, engagement, monétisation, parrainage, coûts IA)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_metrics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(p_days, 1));
  v_result jsonb;
begin
  with
  paid_users as (
    select distinct on (s.user_id) s.user_id, s.plan_key
    from public.subscriptions s
    where s.status = 'active' and s.starts_at <= now() and s.ends_at > now()
    order by s.user_id, s.ends_at desc
  ),
  first_product as (select owner_id as user_id, min(created_at) as at from public.products group by owner_id),
  first_poster as (select user_id, min(created_at) as at from public.creations group by user_id),
  first_content as (select owner_id as user_id, min(created_at) as at from public.marketing_packs group by owner_id),
  first_share as (select shop_id, min(created_at) as at from public.shop_events where type = 'share_click' group by shop_id),
  first_paid_sub as (select user_id, min(created_at) as at from public.subscriptions where source in ('payment', 'promotion') group by user_id),
  referred as (select user_id, created_at from public.account_profiles where referred_by is not null)
  select jsonb_build_object(
    'days', p_days,
    'acquisition', jsonb_build_object(
      'new_accounts', (select count(*) from auth.users where created_at >= v_since),
      'total_accounts', (select count(*) from auth.users),
      'new_shops', (select count(*) from public.shops where created_at >= v_since),
      'shops_published', (select count(*) from public.shops where published_at >= v_since),
      'total_published_shops', (select count(*) from public.shops where status = 'published')
    ),
    'activation', jsonb_build_object(
      'first_product', (select count(*) from first_product where at >= v_since),
      'first_poster', (select count(*) from first_poster where at >= v_since),
      'first_content', (select count(*) from first_content where at >= v_since),
      'first_share', (select count(*) from first_share where at >= v_since)
    ),
    'engagement', jsonb_build_object(
      'active_shops_7d', (select count(distinct shop_id) from public.shop_events
                          where type in ('whatsapp_click', 'call_click', 'order_click') and created_at >= now() - interval '7 days'),
      'active_shops_prev_7d', (select count(distinct shop_id) from public.shop_events
                          where type in ('whatsapp_click', 'call_click', 'order_click')
                            and created_at >= now() - interval '14 days' and created_at < now() - interval '7 days'),
      'active_shops_period', (select count(distinct shop_id) from public.shop_events
                          where type in ('whatsapp_click', 'call_click', 'order_click') and created_at >= v_since),
      'visits', (select count(*) from public.shop_events where type in ('shop_view', 'product_view') and created_at >= v_since),
      'whatsapp_clicks', (select count(*) from public.shop_events where type = 'whatsapp_click' and created_at >= v_since),
      'call_clicks', (select count(*) from public.shop_events where type = 'call_click' and created_at >= v_since),
      'posters_generated', (select count(*) from public.creations where created_at >= v_since),
      'contents_generated', (select count(*) from public.marketing_packs where created_at >= v_since)
    ),
    'monetization', jsonb_build_object(
      'pro_users', (select count(*) from paid_users where plan_key = 'pro'),
      'business_users', (select count(*) from paid_users where plan_key = 'business'),
      'free_users', (select count(*) from auth.users) - (select count(*) from paid_users),
      'founding_users', (select count(*) from public.account_profiles where is_founding),
      'revenue_total', (select coalesce(sum(amount), 0) from public.orders where status = 'paid' and paid_at >= v_since),
      'revenue_by_kind', (select coalesce(jsonb_object_agg(kind, total), '{}'::jsonb) from (
                            select kind, sum(amount) as total from public.orders where status = 'paid' and paid_at >= v_since group by kind) k),
      'conversions_to_paid', (select count(*) from first_paid_sub where at >= v_since)
    ),
    'referral', jsonb_build_object(
      'signups', (select count(*) from referred where created_at >= v_since),
      'shops_created', (select count(*) from public.shops s join referred r on r.user_id = s.owner_id where s.created_at >= v_since),
      'shops_published', (select count(*) from public.shops s join referred r on r.user_id = s.owner_id where s.published_at >= v_since),
      'converted_to_paid', (select count(*) from first_paid_sub f join referred r on r.user_id = f.user_id where f.at >= v_since),
      'top_referrers', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
                          select p.referral_code as code, count(*) as signups
                          from public.account_profiles a join public.account_profiles p on p.user_id = a.referred_by
                          where a.created_at >= v_since group by p.referral_code order by count(*) desc limit 5) t)
    ),
    'ai', jsonb_build_object(
      'cost_usd', (select coalesce(sum(est_cost_usd), 0) from public.ai_calls where created_at >= v_since),
      'calls', (select count(*) from public.ai_calls where created_at >= v_since),
      'by_feature', (select coalesce(jsonb_object_agg(feature, jsonb_build_object('calls', n, 'cost_usd', c)), '{}'::jsonb) from (
                       select feature, count(*) as n, sum(est_cost_usd) as c from public.ai_calls where created_at >= v_since group by feature) f),
      'users_with_usage', (select count(distinct user_id) from public.ai_calls where created_at >= v_since and user_id is not null),
      'generations', (select coalesce(sum(units), 0) from public.usage_events where created_at >= v_since and source <> 'included')
    )
  ) into v_result;
  return v_result;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. Droits d'exécution : fonctions internes réservées au serveur (service_role)
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.billing_entitlements(uuid) from public, anon, authenticated;
revoke all on function public.consume_usage(uuid, text, integer, text[], uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.refund_usage(uuid) from public, anon, authenticated;
revoke all on function public.grant_credits(uuid, integer, text, text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.billing_quote_plan(uuid, text, text) from public, anon, authenticated;
revoke all on function public.fulfill_order(text, text) from public, anon, authenticated;
revoke all on function public.admin_metrics(integer) from public, anon, authenticated;
revoke all on function public.generate_referral_code(text) from public, anon, authenticated;
revoke all on function public.handle_new_account() from public, anon, authenticated;

grant execute on function public.billing_entitlements(uuid) to service_role;
grant execute on function public.consume_usage(uuid, text, integer, text[], uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.refund_usage(uuid) to service_role;
grant execute on function public.grant_credits(uuid, integer, text, text, uuid, timestamptz) to service_role;
grant execute on function public.billing_quote_plan(uuid, text, text) to service_role;
grant execute on function public.fulfill_order(text, text) to service_role;
grant execute on function public.admin_metrics(integer) to service_role;

revoke all on function public.get_my_entitlements() from public, anon;
grant execute on function public.get_my_entitlements() to authenticated, service_role;

revoke all on function public.shop_public_meta(uuid) from public;
grant execute on function public.shop_public_meta(uuid) to anon, authenticated, service_role;
revoke all on function public.public_promotions() from public;
grant execute on function public.public_promotions() to anon, authenticated, service_role;
