-- ─────────────────────────────────────────────────────────────────────────────
-- 0033 — Notifications push (à exécuter après 0032)
--
-- • push_subscriptions : un abonnement par appareil (adresse d'envoi fournie par le navigateur
--   + clés de chiffrement). Un vendeur peut en avoir plusieurs (téléphone, ordinateur…).
--   L'adresse (endpoint) est unique : si un autre compte se connecte sur le même appareil et
--   active les notifications, l'abonnement passe à ce compte.
-- • notification_preferences : types coupés par le vendeur (absent = activé).
--   Types : order (commande reçue), payment (paiement confirmé), market (annonce mise sur le
--   Market par Jaarle), test.
-- Le vendeur gère ses lignes (RLS) ; l'envoi lit tout avec la clé service_role.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint push_subscriptions_endpoint_key unique (endpoint),
  constraint push_subscriptions_endpoint_https check (endpoint like 'https://%'),
  constraint push_subscriptions_sizes check (char_length(endpoint) <= 1000 and char_length(p256dh) <= 200 and char_length(auth) <= 100)
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions own select" on public.push_subscriptions;
create policy "push_subscriptions own select" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "push_subscriptions own delete" on public.push_subscriptions;
create policy "push_subscriptions own delete" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());
-- Insertion / mise à jour : par le serveur (server action, clé service_role), après vérification
-- de la session — l'adresse peut appartenir à un autre compte (même appareil), ce que la RLS
-- ne permettrait pas de reprendre proprement.

create table if not exists public.notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, type),
  constraint notification_preferences_type_check check (type in ('order', 'payment', 'market'))
);
alter table public.notification_preferences enable row level security;

drop policy if exists "notification_preferences own all" on public.notification_preferences;
create policy "notification_preferences own all" on public.notification_preferences
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
