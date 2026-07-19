-- Logo et nom d'entreprise personnalisés (palier Premium uniquement).
-- À exécuter après 0006_delete_creations.sql.

alter table public.creations
  add column if not exists logo_path text,
  add column if not exists business_name text;
