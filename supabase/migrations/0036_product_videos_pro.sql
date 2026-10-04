-- ─────────────────────────────────────────────────────────────────────────────
-- 0036 — Vidéo produit réservée aux comptes Pro (ou plus) — à exécuter après 0035
--
-- • Ajouter / remplacer une vidéo : abonnement payant actif obligatoire (trigger + policy de
--   stockage : un compte Gratuit ne peut même pas déposer de fichier dans product-videos).
-- • Abonnement terminé (retour en Gratuit) : les vidéos restent en base mais sont MASQUÉES du
--   public (vitrine, fiche, Market). Elles réapparaissent dès que le vendeur repasse Pro.
--   Le vendeur voit toujours sa vidéo dans son tableau de bord et peut la supprimer.
-- • « Pro » = public.user_is_pro() (migration 0026) : abonnement actif, plan ≠ free, en cours.
-- Migration rejouable.
-- ─────────────────────────────────────────────────────────────────────────────

-- Accès vidéo d'un vendeur. SECURITY DEFINER : user_is_pro() n'est pas exécutable par
-- anon / authenticated (tables d'abonnement privées). Ne révèle qu'un booléen, déjà visible
-- publiquement via le badge PRO.
create or replace function public.owner_has_video_access(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_is_pro(p_owner);
$$;
revoke all on function public.owner_has_video_access(uuid) from public;
grant execute on function public.owner_has_video_access(uuid) to anon, authenticated, service_role;

-- 1. Écriture : Pro obligatoire pour ajouter ou remplacer une vidéo ────────────
create or replace function public.product_videos_require_pro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Les écritures serveur (service_role : admin, maintenance) ne sont pas concernées.
  if not public.billing_is_end_user() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.path = old.path then
    return new; -- ex. mise à jour de l'aperçu d'une vidéo existante
  end if;
  if not public.user_is_pro(new.owner_id) then
    raise exception 'PRO_REQUIRED:video' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists product_videos_require_pro on public.product_videos;
create trigger product_videos_require_pro
  before insert or update of path on public.product_videos
  for each row execute function public.product_videos_require_pro();

-- 2. Lecture publique : seulement si le vendeur est Pro ───────────────────────
drop policy if exists "product_videos_select_public" on public.product_videos;
create policy "product_videos_select_public"
  on public.product_videos for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.products p
      join public.shops s on s.id = p.shop_id
      where p.id = product_videos.product_id
        and p.status in ('active', 'sold_out')
        and s.status = 'published'
    )
    and public.owner_has_video_access(product_videos.owner_id)
  );

-- 3. Stockage : un compte Gratuit ne peut pas déposer de vidéo (coût de stockage maîtrisé) ─
drop policy if exists "product_videos_obj_insert_own" on storage.objects;
create policy "product_videos_obj_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ '^[0-9a-f-]{36}/videos/[0-9a-f-]{36}\.mp4$'
    and public.owner_has_video_access(auth.uid())
  );

-- Les vidéos ne sont jamais réécrites en place (chemin unique à chaque envoi) : plus de mise à
-- jour d'objet, ce qui ferme aussi la voie « upsert » pour un compte redevenu Gratuit.
drop policy if exists "product_videos_obj_update_own" on storage.objects;
