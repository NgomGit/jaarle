-- Support des créations de type "service" (location de voiture, femme de ménage, nettoyage
-- auto, etc.) : nom + description brève + liste d'items proposés, sans photo obligatoire —
-- l'IA compose alors le visuel entièrement à partir du brief plutôt que d'une photo de référence.
-- À exécuter après 0009_optional_price.sql.

alter table public.creations
  add column if not exists subject_type text not null default 'product',
  add column if not exists service_description text,
  add column if not exists service_items text[];

alter table public.creations
  alter column photo_path drop not null;
