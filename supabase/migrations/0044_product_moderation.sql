-- 0044 — Modération des produits par l'admin
-- L'admin peut masquer un produit indésirable (raison gardée). Le produit passe en 'hidden' : il
-- disparaît de la vitrine, du Market et de l'annuaire (mêmes filtres qu'aujourd'hui).
-- Le vendeur voit « Masqué par Jaarle » et la raison, peut corriger le produit et demander une
-- vérification, mais ne peut PAS le remettre en ligne lui-même (verrou ci-dessous) : seul l'admin
-- (service_role) lève la modération. Les boutiques ont déjà leur suspension (0015 / 0026).
-- Rejouable.

alter table public.products add column if not exists moderated_at timestamptz;
alter table public.products add column if not exists moderated_reason text;
alter table public.products add column if not exists moderated_by uuid references auth.users(id) on delete set null;
alter table public.products add column if not exists moderated_prev_status text;
alter table public.products add column if not exists review_requested_at timestamptz;
alter table public.products drop constraint if exists products_moderated_reason_length;
alter table public.products add constraint products_moderated_reason_length check (moderated_reason is null or char_length(moderated_reason) <= 500);
create index if not exists products_moderated_idx on public.products(moderated_at desc) where moderated_at is not null;

-- Verrou : pour un vendeur (rôles anon / authenticated), les champs de modération ne bougent pas,
-- un produit masqué reste 'hidden', et seule la demande de vérification peut être posée (à now()).
create or replace function public.products_guard_moderation()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new; -- admin (service_role) ou migrations
  end if;

  if tg_op = 'INSERT' then
    new.moderated_at := null;
    new.moderated_reason := null;
    new.moderated_by := null;
    new.moderated_prev_status := null;
    new.review_requested_at := null;
    return new;
  end if;

  new.moderated_at := old.moderated_at;
  new.moderated_reason := old.moderated_reason;
  new.moderated_by := old.moderated_by;
  new.moderated_prev_status := old.moderated_prev_status;

  if old.moderated_at is null then
    new.review_requested_at := null;
  else
    new.status := 'hidden';
    if new.review_requested_at is distinct from old.review_requested_at then
      new.review_requested_at := case when new.review_requested_at is null then old.review_requested_at else now() end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists products_guard_moderation on public.products;
create trigger products_guard_moderation
  before insert or update on public.products
  for each row execute function public.products_guard_moderation();
