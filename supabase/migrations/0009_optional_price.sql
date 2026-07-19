-- Le prix produit devient optionnel : certains marchands vendent des services dont le prix
-- dépend de la demande du client et préfèrent afficher "Sur devis" plutôt qu'un prix fixe.
-- price = null signifie "prix sur devis". À exécuter après 0008_contact_phone.sql.

alter table public.creations
  alter column price drop not null;
