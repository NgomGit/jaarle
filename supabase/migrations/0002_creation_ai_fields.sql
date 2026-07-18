-- Ajoute les champs liés à la génération IA (texte + image stylisée).
-- À exécuter une fois dans le SQL Editor du dashboard Supabase, après 0001_creations.sql.

alter table public.creations
  add column if not exists industry text,
  add column if not exists language text not null default 'fr',
  add column if not exists generated_copy text,
  add column if not exists generated_hashtags text[],
  add column if not exists poster_path text;
