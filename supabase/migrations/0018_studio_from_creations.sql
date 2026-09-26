-- Jaarle 2.0 — Studio Marketing à partir des AFFICHES déjà créées (creations).
-- Un pack peut désormais partir d'une affiche (creation_id, + version choisie) au lieu d'un produit.
-- Les commerçants SANS boutique peuvent utiliser le Studio depuis leurs affiches : shop_id devient
-- facultatif (mais reste obligatoire pour un pack « produit » : un pack a toujours une affiche ou une
-- boutique ; product_id peut redevenir nul si le produit est supprimé, comme avant).
-- Aucune table du générateur d'affiches n'est modifiée. Script idempotent. À exécuter après 0017.

alter table public.marketing_packs
  alter column shop_id drop not null;

alter table public.marketing_packs
  add column if not exists creation_id uuid references public.creations(id) on delete cascade,
  add column if not exists creation_version_id uuid references public.creation_versions(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'marketing_packs_source_check') then
    alter table public.marketing_packs
      add constraint marketing_packs_source_check
      check (creation_id is not null or shop_id is not null);
  end if;
end;
$$;

create index if not exists marketing_packs_creation_idx
  on public.marketing_packs(creation_id, created_at desc)
  where creation_id is not null;

-- Cohérence propriétaire (y compris pour les écritures service_role).
create or replace function public.marketing_packs_check_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.shop_id is not null
     and not exists (select 1 from public.shops s where s.id = new.shop_id and s.owner_id = new.owner_id) then
    raise exception 'marketing_packs.owner_id doit correspondre au propriétaire de la boutique' using errcode = '42501';
  end if;
  if new.product_id is not null
     and (new.shop_id is null
          or not exists (select 1 from public.products p where p.id = new.product_id and p.shop_id = new.shop_id)) then
    raise exception 'Le produit n''appartient pas à cette boutique' using errcode = '42501';
  end if;
  if new.creation_id is not null
     and not exists (select 1 from public.creations c where c.id = new.creation_id and c.user_id = new.owner_id) then
    raise exception 'L''affiche n''appartient pas à cet utilisateur' using errcode = '42501';
  end if;
  if new.creation_version_id is not null
     and (new.creation_id is null
          or not exists (select 1 from public.creation_versions v
                         where v.id = new.creation_version_id and v.creation_id = new.creation_id)) then
    raise exception 'La version n''appartient pas à cette affiche' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists marketing_packs_check_owner on public.marketing_packs;
create trigger marketing_packs_check_owner
  before insert or update of shop_id, product_id, owner_id, creation_id, creation_version_id on public.marketing_packs
  for each row execute function public.marketing_packs_check_owner();
