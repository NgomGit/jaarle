-- Jaarle — Coûts IA par vendeur et par formule (LECTURE SEULE, à coller dans le SQL Editor de Supabase).
-- Même calcul que l'onglet admin « Coûts IA » : chaque appel de ai_calls est rattaché à la formule
-- active au moment de l'appel (la plus haute, puis la plus longue — règle de 0039).
-- Réglages : période (30 jours) et conversion (600 F pour 1 $) dans « params ».

with params as (
  select now() - interval '30 days' as since, 30.0 as days, 600::numeric as fcfa_per_usd
),
calls as (
  select c.user_id, c.feature, c.est_cost_usd::numeric as cost_usd, c.created_at,
         coalesce((
           select s.plan_key
           from public.subscriptions s join public.plans p on p.key = s.plan_key
           where s.user_id = c.user_id and s.status = 'active'
             and s.starts_at <= c.created_at and s.ends_at > c.created_at
           order by p.sort desc, s.ends_at desc
           limit 1
         ), 'free') as plan_key
  from public.ai_calls c, params
  where c.created_at >= params.since and c.user_id is not null
),
per_user as (
  select plan_key, user_id, count(*) as appels, sum(cost_usd) as cost_usd
  from calls group by plan_key, user_id
),
current_subs as (
  select distinct on (s.user_id) s.user_id, s.plan_key
  from public.subscriptions s join public.plans p on p.key = s.plan_key
  where s.status = 'active' and s.starts_at <= now() and s.ends_at > now()
  order by s.user_id, p.sort desc, s.ends_at desc
)

-- 1. Par formule (coûts ramenés à 30 jours, en FCFA, et en % du prix de la formule)
select
  pl.name as formule,
  pl.price_fcfa as prix_fcfa,
  (select count(*) from current_subs cs where cs.plan_key = pu.plan_key) as abonnes_actuels,
  count(*) as vendeurs_actifs_ia,
  sum(pu.appels) as appels,
  round(sum(pu.cost_usd) * pa.fcfa_per_usd) as cout_total_fcfa,
  round(avg(pu.cost_usd) * 30 / pa.days * pa.fcfa_per_usd) as moyen_fcfa_30j,
  round((percentile_cont(0.5) within group (order by pu.cost_usd))::numeric * 30 / pa.days * pa.fcfa_per_usd) as median_fcfa_30j,
  round((percentile_cont(0.9) within group (order by pu.cost_usd))::numeric * 30 / pa.days * pa.fcfa_per_usd) as p90_fcfa_30j,
  round(max(pu.cost_usd) * 30 / pa.days * pa.fcfa_per_usd) as max_fcfa_30j,
  round(100 * avg(pu.cost_usd) * 30 / pa.days * pa.fcfa_per_usd / nullif(pl.price_fcfa, 0)) as moyen_pct_prix,
  round(100 * max(pu.cost_usd) * 30 / pa.days * pa.fcfa_per_usd / nullif(pl.price_fcfa, 0)) as max_pct_prix
from per_user pu
join public.plans pl on pl.key = pu.plan_key
cross join params pa
group by pl.name, pl.price_fcfa, pl.sort, pu.plan_key, pa.fcfa_per_usd, pa.days
order by pl.sort desc;

-- 2. Les 30 vendeurs les plus coûteux (décommenter pour lancer seul)
-- with params as (select now() - interval '30 days' as since, 600::numeric as fcfa_per_usd)
-- select c.user_id, sh.name as boutique, count(*) as appels,
--        round(sum(c.est_cost_usd) * max(pa.fcfa_per_usd)) as cout_fcfa,
--        mode() within group (order by c.feature) as fonction_principale
-- from public.ai_calls c
-- cross join params pa
-- left join public.shops sh on sh.owner_id = c.user_id
-- where c.created_at >= pa.since and c.user_id is not null
-- group by c.user_id, sh.name
-- order by sum(c.est_cost_usd) desc
-- limit 30;

-- 3. Par fonction (décommenter pour lancer seul)
-- select feature, count(*) as appels,
--        round(avg(est_cost_usd), 4) as cout_moyen_usd,
--        round(sum(est_cost_usd), 2) as cout_total_usd
-- from public.ai_calls
-- where created_at >= now() - interval '30 days'
-- group by feature order by sum(est_cost_usd) desc;
