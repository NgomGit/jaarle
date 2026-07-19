-- Palier Gold : jusqu'à 3 photos produit (photo_path + 2 supplémentaires) et 2 déclinaisons
-- de design générées en parallèle (poster_path = déclinaison 1, poster_path_2 = déclinaison 2).
-- À exécuter après 0010_service_creations.sql.

alter table public.creations
  add column if not exists extra_photo_paths text[],
  add column if not exists poster_path_2 text;
