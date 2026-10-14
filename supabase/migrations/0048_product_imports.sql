-- 0048 — Import en lot (Bulk Upload), phase 1 : session d'import + idempotence de la création
-- • product_imports : une ligne par lot. État complet en jsonb (médias, groupes, non rangés), écrit
--   par le serveur et par le propriétaire (RLS). `version` = verrou optimiste des enregistrements.
-- • grouped_at / usage_event_id : le lot n'est facturé qu'une fois (1 crédit), le 1er lot est offert.
-- • products.import_group_id : un groupe du lot ne crée jamais deux produits (index unique partiel).
-- Les photos du lot sont déjà des photos produit ({uid}/products/…) : aucun nouveau bucket.
-- À exécuter après 0047. Rejouable.

create table if not exists public.product_imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  status text not null default 'uploading'
    check (status in ('uploading', 'analyzing', 'review', 'done', 'canceled')),
  items jsonb not null default '[]'::jsonb,
  groups jsonb not null default '[]'::jsonb,
  unsorted jsonb not null default '[]'::jsonb,
  removed jsonb not null default '[]'::jsonb,
  variants jsonb not null default '[]'::jsonb,
  version integer not null default 0,
  stats jsonb not null default '{}'::jsonb,
  grouped_at timestamptz,
  usage_event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

create index if not exists product_imports_owner_idx on public.product_imports(owner_id, created_at desc);

alter table public.product_imports enable row level security;
drop policy if exists product_imports_owner_all on public.product_imports;
create policy product_imports_owner_all on public.product_imports
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Le vendeur ne peut pas s'effacer la facturation : grouped_at / usage_event_id ne changent que
-- côté serveur (service_role). Pas SECURITY DEFINER : current_user = rôle de l'appelant.
create or replace function public.product_imports_protect_billing()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.grouped_at := null;
      new.usage_event_id := null;
    else
      new.grouped_at := old.grouped_at;
      new.usage_event_id := old.usage_event_id;
      new.owner_id := old.owner_id;
      new.shop_id := old.shop_id;
      new.created_at := old.created_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists product_imports_protect_billing on public.product_imports;
create trigger product_imports_protect_billing
  before insert or update on public.product_imports
  for each row execute function public.product_imports_protect_billing();

-- Idempotence de la création finale
alter table public.products add column if not exists import_group_id uuid;
create unique index if not exists products_import_group_uidx
  on public.products(import_group_id) where import_group_id is not null;
