-- ─────────────────────────────────────────────────────────────────────────────
-- 0031 — Choix de l'affiche d'une fiche (à exécuter après 0030)
--
-- Une fiche (surtout un service réglé sur « l'affiche ») peut avoir plusieurs affiches et
-- plusieurs versions. Le vendeur choisit celle qui s'affiche dans sa boutique et sur le Market :
-- products.poster_key = id de la version choisie (ou de l'affiche, si elle n'a pas de versions).
-- Sans choix, ou si le choix n'est plus valable (affiche supprimée ou détachée) : la dernière
-- version de la dernière affiche débloquée, sinon de la dernière affiche tout court.
-- Affiches non débloquées (offre gratuite) : affichées elles aussi, signées du logo Jaarle par
-- /affiche/{clé} (décision du 2026-10-02, pour ne pas bloquer un vendeur qui a créé son affiche).
-- « Retirer » : poster_key = 00000000-0000-0000-0000-000000000000 → aucune affiche, la photo
-- s'affiche. (Migration rejouable : add column if not exists + create or replace.)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.products add column if not exists poster_key uuid;

create or replace function public.product_poster_key(p_product uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
  -- 0. Affiche retirée par le vendeur : aucune (la photo s'affiche).
  when (select p0.poster_key from public.products p0 where p0.id = p_product) = '00000000-0000-0000-0000-000000000000'::uuid then null
  else coalesce(
    -- 1. L'affiche choisie par le vendeur, si elle est toujours liée à la fiche.
    (select p.poster_key
     from public.products p
     where p.id = p_product and p.poster_key is not null
       and (
         exists (select 1 from public.creation_versions v
                 join public.creations c on c.id = v.creation_id
                 where v.id = p.poster_key and c.product_id = p.id and v.poster_path is not null)
         or exists (select 1 from public.creations c
                    where c.id = p.poster_key and c.product_id = p.id and c.poster_path is not null
                      and not exists (select 1 from public.creation_versions v2 where v2.creation_id = c.id))
       )),
    -- 2. Sinon : dernière version de la dernière affiche, les débloquées d'abord.
    (select coalesce(
              (select v.id from public.creation_versions v where v.creation_id = c.id order by v.created_at desc limit 1),
              c.id)
     from public.creations c
     where c.product_id = p_product and c.poster_path is not null
     order by c.unlocked desc, c.created_at desc
     limit 1)
  ) end;
$$;
revoke all on function public.product_poster_key(uuid) from public, anon, authenticated;
grant execute on function public.product_poster_key(uuid) to service_role;
