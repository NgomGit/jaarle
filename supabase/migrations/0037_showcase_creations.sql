-- ─────────────────────────────────────────────────────────────────────────────
-- 0037 — Vitrine des affiches (à exécuter après 0036)
--
-- L'admin choisit des affiches créées sur Jaarle (page /dashboard/admin/affiches) pour les
-- montrer sur le site public (accueil « Des affiches créées avec Jaarle », page
-- /affiche-publicitaire). Les images sont servies par /vitrine/{id} : uniquement les affiches
-- choisies ; une affiche non débloquée reste réduite et signée du logo Jaarle (règle du 2026-10-02).
-- Aucune policy : lecture / écriture par le serveur (service_role) uniquement.
-- Migration rejouable.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.showcase_creations (
  creation_id uuid primary key references public.creations(id) on delete cascade,
  sort integer not null default 0,
  featured_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.showcase_creations enable row level security;
