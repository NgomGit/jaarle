-- Jaarle 2.0 — Studio Marketing : contenus sociaux générés à partir des produits d'une boutique.
-- Un « pack » = une génération (produit + objectif) ; un « post » = une déclinaison par plateforme,
-- avec 3 variantes de texte. Les visuels ne sont PAS stockés : ils sont rendus à la volée à partir
-- de ces données (voir /api/studio/visual). Les colonnes publish_* préparent la publication via API
-- (Meta, TikTok) sans être utilisées par le MVP (publication manuelle).
-- Aucune table existante n'est modifiée. Script idempotent. À exécuter après 0016_shop_media_bucket.sql.

create table if not exists public.marketing_packs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  objective text not null,
  promo_detail text,                     -- offre décrite PAR LE COMMERÇANT (jamais inventée par l'IA)
  extra_facts text,                      -- précisions factuelles saisies par le commerçant
  model text,
  created_at timestamptz not null default now(),
  constraint marketing_packs_objective_check check (objective in ('sell', 'present', 'promo', 'new')),
  constraint marketing_packs_promo_required check (objective <> 'promo' or char_length(btrim(coalesce(promo_detail, ''))) > 0),
  constraint marketing_packs_promo_length check (promo_detail is null or char_length(promo_detail) <= 160),
  constraint marketing_packs_facts_length check (extra_facts is null or char_length(extra_facts) <= 300)
);

create index if not exists marketing_packs_product_idx on public.marketing_packs(product_id, created_at desc);
create index if not exists marketing_packs_owner_idx on public.marketing_packs(owner_id, created_at desc);

create table if not exists public.marketing_posts (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.marketing_packs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  format text not null,
  variants jsonb not null default '[]'::jsonb,   -- [{caption, hashtags[], cta, headline, subline}]
  selected_variant smallint not null default 0,
  copy_count integer not null default 0,
  download_count integer not null default 0,
  regenerated_count integer not null default 0,
  -- Publication via API (plus tard) — inutilisé par le MVP.
  publish_status text not null default 'draft',
  scheduled_at timestamptz,
  published_at timestamptz,
  external_id text,
  external_url text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_posts_platform_check check (platform in ('instagram_feed', 'facebook', 'tiktok', 'instagram_story', 'whatsapp_status')),
  constraint marketing_posts_format_check check (format in ('square', 'story')),
  constraint marketing_posts_variants_array check (jsonb_typeof(variants) = 'array'),
  constraint marketing_posts_selected_range check (selected_variant between 0 and 9),
  constraint marketing_posts_publish_status_check check (publish_status in ('draft', 'ready', 'scheduled', 'published', 'failed')),
  constraint marketing_posts_pack_platform_key unique (pack_id, platform)
);

create index if not exists marketing_posts_pack_idx on public.marketing_posts(pack_id);

drop trigger if exists marketing_posts_set_updated_at on public.marketing_posts;
create trigger marketing_posts_set_updated_at
  before update on public.marketing_posts
  for each row execute function public.set_updated_at();

-- Cohérence propriétaire (y compris pour les écritures service_role).
create or replace function public.marketing_packs_check_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.shops s where s.id = new.shop_id and s.owner_id = new.owner_id) then
    raise exception 'marketing_packs.owner_id doit correspondre au propriétaire de la boutique' using errcode = '42501';
  end if;
  if new.product_id is not null
     and not exists (select 1 from public.products p where p.id = new.product_id and p.shop_id = new.shop_id) then
    raise exception 'Le produit n''appartient pas à cette boutique' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists marketing_packs_check_owner on public.marketing_packs;
create trigger marketing_packs_check_owner
  before insert or update of shop_id, product_id, owner_id on public.marketing_packs
  for each row execute function public.marketing_packs_check_owner();

create or replace function public.marketing_posts_check_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.marketing_packs k where k.id = new.pack_id and k.owner_id = new.owner_id) then
    raise exception 'marketing_posts.owner_id doit correspondre au propriétaire du pack' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists marketing_posts_check_owner on public.marketing_posts;
create trigger marketing_posts_check_owner
  before insert or update of pack_id, owner_id on public.marketing_posts
  for each row execute function public.marketing_posts_check_owner();

-- RLS : contenus privés, visibles et modifiables uniquement par leur propriétaire.
alter table public.marketing_packs enable row level security;
alter table public.marketing_posts enable row level security;

drop policy if exists "marketing_packs_all_own" on public.marketing_packs;
create policy "marketing_packs_all_own"
  on public.marketing_packs for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "marketing_posts_all_own" on public.marketing_posts;
create policy "marketing_posts_all_own"
  on public.marketing_posts for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Incrément atomique des compteurs (copie / téléchargement) sans exposer d'UPDATE libre.
create or replace function public.marketing_post_track(p_post_id uuid, p_action text)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.marketing_posts
     set copy_count = copy_count + case when p_action = 'copy' then 1 else 0 end,
         download_count = download_count + case when p_action = 'download' then 1 else 0 end
   where id = p_post_id and owner_id = auth.uid();
$$;

revoke all on function public.marketing_post_track(uuid, text) from public;
revoke all on function public.marketing_post_track(uuid, text) from anon;
grant execute on function public.marketing_post_track(uuid, text) to authenticated;
