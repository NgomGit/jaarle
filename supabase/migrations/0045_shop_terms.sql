-- 0045 — Acceptation des conditions générales à la création de boutique
-- Version acceptée (lib/legal/terms.ts → TERMS_VERSION) et date. À l'inscription, la même
-- information est gardée dans les métadonnées du compte (terms_version, terms_accepted_at).
-- Rejouable.

alter table public.shops add column if not exists terms_accepted_at timestamptz;
alter table public.shops add column if not exists terms_version text;
alter table public.shops drop constraint if exists shops_terms_version_length;
alter table public.shops add constraint shops_terms_version_length check (terms_version is null or char_length(terms_version) <= 20);
