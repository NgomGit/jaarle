-- Palier Advanced (Gold) : permet au marchand de choisir d'afficher ses photos secondaires
-- directement sur l'affiche (plans de détail/angle en plus de l'image principale) plutôt que
-- de les utiliser uniquement comme référence interne pour l'IA. Persisté pour que la
-- déclinaison à la demande (poster_path_2) respecte le même choix que la 1ère variation.
-- À exécuter après 0012_gold_declination.sql.

alter table public.creations
  add column if not exists show_secondary_photos boolean not null default false;
