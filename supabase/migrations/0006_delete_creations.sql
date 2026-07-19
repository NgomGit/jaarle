-- Permet à un utilisateur de supprimer ses propres créations (ligne + fichiers stockés).
-- À exécuter après 0005_tiers.sql.

-- orders.creation_id n'avait pas de comportement ON DELETE défini : supprimer une création
-- déjà payée aurait échoué avec une violation de contrainte. On passe à SET NULL pour garder
-- l'historique de paiement (comptabilité) même si la création elle-même est supprimée.
alter table public.orders drop constraint if exists orders_creation_id_fkey;
alter table public.orders add constraint orders_creation_id_fkey
  foreign key (creation_id) references public.creations(id) on delete set null;

create policy "creations_delete_own"
  on public.creations for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "creation_photos_delete_own"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'creations' and (storage.foldername(name))[1] = auth.uid()::text);
