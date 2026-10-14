-- 0047 — Nouvelle grille « 1 génération = 1 action IA » (décision du 2026-10-12)
--
-- • 1 génération (ou 1 crédit) = 1 affiche, 1 nouvelle version d'affiche, 1 pack Studio,
--   et plus tard 1 import en lot. Avant : une affiche premium coûtait 2 générations et la
--   nouvelle version était incluse.
-- • Quotas mensuels : Gratuit 2 (= les 2 affiches qu'il avait déjà), Pro 8, Business 25.
--   Prix inchangés : Pro 2 500 F, Business 5 000 F (toujours « bientôt » à l'achat, offert par l'admin).
-- • Import en lot (Bulk Upload, en préparation) : réservé Pro et Business, limites dans
--   plans.features.bulk_upload (lues par lib/billing/entitlements.ts).
-- • Transition : sur la période en cours, les affiches déjà comptées 2 sont ramenées à 1, pour
--   que personne ne perde d'affiches au changement d'unité. Les crédits déjà payés ne bougent pas
--   (un crédit vaut désormais une affiche entière : le pack de 5 donne 5 affiches).
--
-- À exécuter après 0046. Rejouable (ne touche que les lignes encore à l'ancienne valeur).

-- 1. Formules ───────────────────────────────────────────────────────────────────
update public.plans
set limits = jsonb_set(coalesce(limits, '{}'::jsonb), '{monthly_generations}', '2'::jsonb),
    highlights = array[
      'Ta boutique en ligne avec lien et QR code',
      'Jusqu''à 10 produits',
      'Bouton WhatsApp pour recevoir les commandes',
      '2 générations IA par mois (1 génération = 1 affiche)',
      'Statistiques des 7 derniers jours'
    ],
    updated_at = now()
where key = 'free';

update public.plans
set limits = jsonb_set(coalesce(limits, '{}'::jsonb), '{monthly_generations}', '8'::jsonb),
    features = coalesce(features, '{}'::jsonb)
               || jsonb_build_object('bulk_upload', jsonb_build_object('photos_per_lot', 30, 'videos_per_lot', 3)),
    highlights = array[
      'Produits illimités',
      '8 générations IA par mois : 1 génération = 1 affiche, 1 nouvelle version ou 1 pack de publications',
      'Affiches HD sans filigrane',
      'Import de plusieurs produits en une fois (bientôt)',
      'Publications Instagram, Facebook, TikTok, Story et Statut WhatsApp',
      'Statistiques détaillées (30 jours, sources, produits)'
    ],
    updated_at = now()
where key = 'pro';

update public.plans
set limits = jsonb_set(coalesce(limits, '{}'::jsonb), '{monthly_generations}', '25'::jsonb),
    features = coalesce(features, '{}'::jsonb)
               || jsonb_build_object('bulk_upload', jsonb_build_object('photos_per_lot', 30, 'videos_per_lot', 6)),
    highlights = array[
      'Tout ce qu''il y a dans Pro',
      '25 générations IA par mois',
      'Import de plusieurs produits en une fois, avec plus de vidéos (bientôt)',
      'Rapports et fonctions marketing avancées',
      'Support prioritaire'
    ],
    updated_at = now()
where key = 'business';

-- 2. Nouvelle action « import en lot » (Bulk Upload) ───────────────────────────────
alter table public.usage_events drop constraint if exists usage_events_action_check;
alter table public.usage_events add constraint usage_events_action_check check (action in (
  'poster_generate', 'poster_regenerate', 'poster_declination', 'poster_unlock',
  'studio_pack', 'studio_regenerate', 'product_autofill', 'bulk_import'
));

-- 3. Transition de la période en cours ──────────────────────────────────────────────
-- Affiches (et déblocages) imputés au quota à 2 générations sur les 31 derniers jours → 1.
-- Les remboursements correspondants (-2) passent à -1, pour que le total reste juste.
-- Seules les lignes à ±2 sont touchées : rejouer la migration ne change plus rien.
update public.usage_events
set units = sign(units) * 1,
    meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('units_before_0047', units)
where source = 'quota'
  and action in ('poster_generate', 'poster_unlock')
  and abs(units) = 2
  and period_start >= now() - interval '31 days';
