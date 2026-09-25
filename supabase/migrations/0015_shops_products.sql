-- Jaarle 2.0 — Phase 0 : boutiques, produits, photos produit, événements de boutique.
-- Ajoute des tables À CÔTÉ de l'existant : le générateur d'affiches (creations, creation_versions,
-- orders) garde exactement son comportement. Sur `creations`, seules des colonnes nullables (ou avec
-- valeur par défaut) sont ajoutées.
-- Script idempotent. À exécuter après 0014_creation_versions.sql (SQL Editor du dashboard Supabase).

-- ─────────────────────────────────────────────────────────────────────────────
-- Utilitaire : updated_at automatique
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- shops : une boutique publique par commerçant (MVP), accessible via /boutique/{slug}
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  industry text,                         -- industryKey de lib/knowledge/category-tree.ts
  category_label text,                   -- libellé lisible choisi (feuille), pour l'affichage
  city text,
  district text,
  whatsapp text not null,                -- format E.164, ex. +221771234567
  phone text,
  logo_path text,                        -- chemin dans le bucket public shop-media
  banner_path text,
  socials jsonb not null default '{}'::jsonb,
  hours text,
  brand jsonb not null default '{}'::jsonb, -- couleurs, ton, langue (utilisé plus tard par buildShopContext)
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shops_slug_key unique (slug),
  -- 3 à 40 caractères, minuscules/chiffres/tirets, pas de tiret en début/fin ni de double tiret.
  constraint shops_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' and slug !~ '--'),
  -- Garder synchronisé avec RESERVED_SLUGS dans lib/shops/slug.ts
  constraint shops_slug_reserved check (slug <> all (array[
    'admin','api','app','aide','boutique','boutiques','catalogue','compte','connexion','contact',
    'dashboard','help','inscription','jaarle','login','new','nouveau','nouvelle','p','q','r',
    'register','settings','static','support','www'
  ])),
  constraint shops_name_length check (char_length(btrim(name)) between 2 and 60),
  constraint shops_description_length check (description is null or char_length(description) <= 500),
  constraint shops_whatsapp_format check (whatsapp ~ '^\+[0-9]{8,15}$'),
  constraint shops_phone_format check (phone is null or phone ~ '^\+[0-9]{8,15}$'),
  constraint shops_status_check check (status in ('draft', 'published', 'suspended')),
  constraint shops_socials_object check (jsonb_typeof(socials) = 'object'),
  constraint shops_brand_object check (jsonb_typeof(brand) = 'object')
);

-- MVP : une seule boutique par compte. Supprimer cet index suffira pour ouvrir le multi-boutiques.
create unique index if not exists shops_one_per_owner on public.shops(owner_id);
create index if not exists shops_status_idx on public.shops(status);

-- published_at renseigné automatiquement à la première publication.
create or replace function public.shops_before_write()
returns trigger
language plpgsql
as $$
begin
  new.slug = lower(new.slug);
  if new.status = 'published' and new.published_at is null then
    new.published_at = now();
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists shops_before_write on public.shops;
create trigger shops_before_write
  before insert or update on public.shops
  for each row execute function public.shops_before_write();

-- Disponibilité d'un slug. SECURITY DEFINER : la RLS masque les boutiques brouillon des autres,
-- une requête directe répondrait « disponible » à tort.
create or replace function public.is_shop_slug_available(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.shops where slug = lower(p_slug));
$$;

-- Supabase accorde par défaut EXECUTE à anon/authenticated sur les fonctions de public : on retire
-- explicitement anon (un visiteur non connecté n'a pas à sonder les slugs).
revoke all on function public.is_shop_slug_available(text) from public;
revoke all on function public.is_shop_slug_available(text) from anon;
grant execute on function public.is_shop_slug_available(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- products : un produit (ou service) = la source unique pour boutique, fiche, affiches, textes…
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, -- dénormalisé pour une RLS simple
  slug text not null,
  subject_type text not null default 'product',
  name text not null,
  description text,
  price integer,                          -- null = « Prix sur demande »
  compare_at_price integer,               -- prix barré (promo), plus tard
  category text,
  options jsonb not null default '[]'::jsonb, -- ex. [{"name":"Taille","values":["M","L","XL"]}]
  status text not null default 'active',
  position integer not null default 0,
  ai_suggestions jsonb,                   -- dernière proposition IA (phase 3), pour mesurer l'acceptation
  source_creation_id uuid references public.creations(id) on delete set null, -- import d'une création (phase 7)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_shop_slug_key unique (shop_id, slug),
  constraint products_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$'),
  constraint products_subject_type_check check (subject_type in ('product', 'service')),
  constraint products_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint products_description_length check (description is null or char_length(description) <= 2000),
  constraint products_price_positive check (price is null or price >= 0),
  constraint products_compare_price_positive check (compare_at_price is null or compare_at_price >= 0),
  constraint products_options_array check (jsonb_typeof(options) = 'array'),
  constraint products_status_check check (status in ('draft', 'active', 'sold_out', 'hidden'))
);

create index if not exists products_shop_listing_idx on public.products(shop_id, status, position);
create index if not exists products_owner_idx on public.products(owner_id);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- Garde-fou : owner_id doit être le propriétaire de la boutique (y compris pour les écritures
-- faites avec la clé service_role, qui contournent la RLS).
create or replace function public.products_check_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.shops s where s.id = new.shop_id and s.owner_id = new.owner_id) then
    raise exception 'products.owner_id doit correspondre au propriétaire de la boutique'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists products_check_owner on public.products;
create trigger products_check_owner
  before insert or update of shop_id, owner_id on public.products
  for each row execute function public.products_check_owner();

-- ─────────────────────────────────────────────────────────────────────────────
-- product_images : jusqu'à 4 photos par produit (bucket public shop-media)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  path text not null,
  position smallint not null default 0,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  constraint product_images_position_range check (position between 0 and 3)
);

create index if not exists product_images_product_idx on public.product_images(product_id, position);

create or replace function public.product_images_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.products p where p.id = new.product_id and p.owner_id = new.owner_id) then
    raise exception 'product_images.owner_id doit correspondre au propriétaire du produit'
      using errcode = '42501';
  end if;
  if (select count(*) from public.product_images i where i.product_id = new.product_id) >= 4 then
    raise exception 'Un produit ne peut pas avoir plus de 4 photos.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists product_images_before_insert on public.product_images;
create trigger product_images_before_insert
  before insert on public.product_images
  for each row execute function public.product_images_before_insert();

-- ─────────────────────────────────────────────────────────────────────────────
-- shop_events : visites, vues produit, clics WhatsApp… (écrits uniquement côté serveur)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.shop_events (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  type text not null,
  source text,                           -- wa, qr, ig, fb, direct…
  visitor_hash text,                     -- empreinte anonyme du jour, jamais d'IP en clair
  created_at timestamptz not null default now(),
  constraint shop_events_type_check check (type in (
    'shop_view', 'product_view', 'whatsapp_click', 'share_click', 'qr_scan', 'order_click'
  )),
  constraint shop_events_source_length check (source is null or char_length(source) <= 32),
  constraint shop_events_visitor_length check (visitor_hash is null or char_length(visitor_hash) <= 64)
);

create index if not exists shop_events_shop_time_idx on public.shop_events(shop_id, created_at desc);
create index if not exists shop_events_shop_type_time_idx on public.shop_events(shop_id, type, created_at desc);
create index if not exists shop_events_product_time_idx on public.shop_events(product_id, created_at desc)
  where product_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- creations : liens optionnels vers la boutique / le produit + format de sortie
-- (aucune donnée existante modifiée ; format = 'square' = le comportement actuel en 1024×1024)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.creations
  add column if not exists shop_id uuid references public.shops(id) on delete set null,
  add column if not exists product_id uuid references public.products(id) on delete set null,
  add column if not exists format text not null default 'square';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'creations_format_check') then
    alter table public.creations
      add constraint creations_format_check check (format in ('square', 'story', 'landscape'));
  end if;
end;
$$;

create index if not exists creations_product_idx on public.creations(product_id) where product_id is not null;
create index if not exists creations_shop_idx on public.creations(shop_id) where shop_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.shops enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.shop_events enable row level security;

-- shops
drop policy if exists "shops_select_own" on public.shops;
create policy "shops_select_own"
  on public.shops for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "shops_select_published" on public.shops;
create policy "shops_select_published"
  on public.shops for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists "shops_insert_own" on public.shops;
create policy "shops_insert_own"
  on public.shops for insert
  to authenticated
  with check (owner_id = auth.uid() and status <> 'suspended');

-- Une boutique suspendue (modération) n'est plus modifiable par son propriétaire, et un
-- propriétaire ne peut jamais poser lui-même le statut 'suspended' ni le retirer.
drop policy if exists "shops_update_own" on public.shops;
create policy "shops_update_own"
  on public.shops for update
  to authenticated
  using (owner_id = auth.uid() and status <> 'suspended')
  with check (owner_id = auth.uid() and status <> 'suspended');

drop policy if exists "shops_delete_own" on public.shops;
create policy "shops_delete_own"
  on public.shops for delete
  to authenticated
  using (owner_id = auth.uid());

-- products
drop policy if exists "products_select_own" on public.products;
create policy "products_select_own"
  on public.products for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "products_select_public" on public.products;
create policy "products_select_public"
  on public.products for select
  to anon, authenticated
  using (
    status in ('active', 'sold_out')
    and exists (select 1 from public.shops s where s.id = products.shop_id and s.status = 'published')
  );

drop policy if exists "products_insert_own" on public.products;
create policy "products_insert_own"
  on public.products for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.shops s
      where s.id = products.shop_id and s.owner_id = auth.uid() and s.status <> 'suspended'
    )
  );

drop policy if exists "products_update_own" on public.products;
create policy "products_update_own"
  on public.products for update
  to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.shops s
      where s.id = products.shop_id and s.owner_id = auth.uid() and s.status <> 'suspended'
    )
  );

drop policy if exists "products_delete_own" on public.products;
create policy "products_delete_own"
  on public.products for delete
  to authenticated
  using (owner_id = auth.uid());

-- product_images
drop policy if exists "product_images_select_own" on public.product_images;
create policy "product_images_select_own"
  on public.product_images for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "product_images_select_public" on public.product_images;
create policy "product_images_select_public"
  on public.product_images for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.products p
      join public.shops s on s.id = p.shop_id
      where p.id = product_images.product_id
        and p.status in ('active', 'sold_out')
        and s.status = 'published'
    )
  );

drop policy if exists "product_images_insert_own" on public.product_images;
create policy "product_images_insert_own"
  on public.product_images for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.products p where p.id = product_images.product_id and p.owner_id = auth.uid())
  );

drop policy if exists "product_images_update_own" on public.product_images;
create policy "product_images_update_own"
  on public.product_images for update
  to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.products p where p.id = product_images.product_id and p.owner_id = auth.uid())
  );

drop policy if exists "product_images_delete_own" on public.product_images;
create policy "product_images_delete_own"
  on public.product_images for delete
  to authenticated
  using (owner_id = auth.uid());

-- shop_events : lecture par le propriétaire uniquement. Aucune policy d'écriture : les événements
-- sont insérés côté serveur (clé service_role) par les routes de tracking, jamais par le navigateur.
drop policy if exists "shop_events_select_own" on public.shop_events;
create policy "shop_events_select_own"
  on public.shop_events for select
  to authenticated
  using (exists (select 1 from public.shops s where s.id = shop_events.shop_id and s.owner_id = auth.uid()));
