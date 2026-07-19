-- Numéro de contact affiché sur l'affiche, éditable par création (au lieu d'être figé
-- sur le numéro WhatsApp du compte). Disponible pour tous les paliers, y compris Basique.
-- À exécuter après 0007_custom_branding.sql.

alter table public.creations
  add column if not exists contact_phone text;
