-- 0049 — Vérification du numéro WhatsApp de la boutique (à exécuter après 0048). Rejouable.
--
-- Principe (vérification « inversée ») : le vendeur envoie depuis SON WhatsApp un message pré-rempli
-- contenant un code (ex. « JRL-482913 ») au numéro Jaarle branché sur l'API WhatsApp Cloud. Le webhook
-- (app/api/whatsapp/webhook) reçoit le message ; WhatsApp fournit lui-même le numéro expéditeur, qui doit
-- être celui de la boutique. Aucun message sortant n'est nécessaire.
--
-- • shops.whatsapp_verified_at : posé uniquement par le serveur (service_role). Le trigger le remet à
--   null dès que le numéro change, quel que soit le chemin (formulaire ou appel direct à l'API REST).
-- • Un numéro vérifié n'appartient qu'à une seule boutique (index unique partiel).
-- • whatsapp_verifications : codes à usage unique, valables 10 min, 5 demandes / heure / boutique.
-- • market_settings.whatsapp_required_from : null = vérification non exigée sur le Market ;
--   une date = à partir de cette date, seules les boutiques vérifiées sont listées.

-- 1. Colonne de vérification
alter table public.shops add column if not exists whatsapp_verified_at timestamptz;

create unique index if not exists shops_verified_whatsapp_unique
  on public.shops ((regexp_replace(whatsapp, '\D', '', 'g')))
  where whatsapp_verified_at is not null;

-- 2. Garde : seul le serveur pose la vérification ; un changement de numéro l'efface.
create or replace function public.shops_whatsapp_guard()
returns trigger
language plpgsql
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_client boolean := v_role in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    if v_client then new.whatsapp_verified_at = null; end if;
    return new;
  end if;
  if regexp_replace(coalesce(new.whatsapp, ''), '\D', '', 'g') is distinct from regexp_replace(coalesce(old.whatsapp, ''), '\D', '', 'g') then
    new.whatsapp_verified_at = null;
  elsif v_client then
    new.whatsapp_verified_at = old.whatsapp_verified_at;
  end if;
  return new;
end;
$$;

drop trigger if exists shops_whatsapp_guard on public.shops;
create trigger shops_whatsapp_guard
  before insert or update on public.shops
  for each row execute function public.shops_whatsapp_guard();

-- 3. Codes de vérification
create table if not exists public.whatsapp_verifications (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  phone text not null,                                   -- E.164, numéro de la boutique au moment de la demande
  code text not null,                                    -- 6 chiffres (affiché « JRL-123456 »)
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'expired', 'superseded', 'rejected')),
  reject_reason text,
  from_number text,                                      -- expéditeur réel vu par WhatsApp
  wa_message_id text unique,                             -- idempotence (Meta peut renvoyer un webhook)
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  verified_at timestamptz
);

create unique index if not exists whatsapp_verifications_pending_code
  on public.whatsapp_verifications(code) where status = 'pending';
create index if not exists whatsapp_verifications_shop_idx
  on public.whatsapp_verifications(shop_id, created_at desc);

alter table public.whatsapp_verifications enable row level security;
drop policy if exists "whatsapp_verifications_select_own" on public.whatsapp_verifications;
create policy "whatsapp_verifications_select_own"
  on public.whatsapp_verifications for select
  to authenticated
  using (owner_id = auth.uid());
-- Pas de policy d'écriture : tout passe par les fonctions ci-dessous.

-- 4. Le vendeur demande un code
create or replace function public.start_whatsapp_verification()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_shop public.shops%rowtype;
  v_code text;
  v_row public.whatsapp_verifications%rowtype;
  v_recent integer;
  v_try integer := 0;
begin
  if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
  select * into v_shop from public.shops where owner_id = auth.uid() limit 1;
  if v_shop.id is null then return jsonb_build_object('status', 'no_shop'); end if;
  if v_shop.status = 'suspended' then return jsonb_build_object('status', 'suspended'); end if;
  if v_shop.whatsapp_verified_at is not null then
    return jsonb_build_object('status', 'already_verified', 'phone', v_shop.whatsapp);
  end if;

  -- Numéro déjà vérifié par une autre boutique : inutile d'envoyer un code.
  if exists (
    select 1 from public.shops s
    where s.id <> v_shop.id and s.whatsapp_verified_at is not null
      and regexp_replace(s.whatsapp, '\D', '', 'g') = regexp_replace(v_shop.whatsapp, '\D', '', 'g')
  ) then
    return jsonb_build_object('status', 'taken', 'phone', v_shop.whatsapp);
  end if;

  -- Code encore valable pour ce numéro : on le renvoie (double clic, rechargement).
  select * into v_row from public.whatsapp_verifications
  where shop_id = v_shop.id and status = 'pending' and expires_at > now() + interval '2 minutes'
    and phone = v_shop.whatsapp
  order by created_at desc limit 1;
  if v_row.id is not null then
    return jsonb_build_object('status', 'pending', 'code', v_row.code, 'phone', v_row.phone, 'expires_at', v_row.expires_at);
  end if;

  select count(*) into v_recent from public.whatsapp_verifications
  where shop_id = v_shop.id and created_at > now() - interval '1 hour';
  if v_recent >= 5 then return jsonb_build_object('status', 'rate_limited'); end if;

  update public.whatsapp_verifications set status = 'superseded'
  where shop_id = v_shop.id and status = 'pending';

  loop
    v_try := v_try + 1;
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    begin
      insert into public.whatsapp_verifications (shop_id, owner_id, phone, code)
      values (v_shop.id, auth.uid(), v_shop.whatsapp, v_code)
      returning * into v_row;
      exit;
    exception when unique_violation then
      if v_try >= 5 then raise; end if;
    end;
  end loop;

  return jsonb_build_object('status', 'pending', 'code', v_row.code, 'phone', v_row.phone, 'expires_at', v_row.expires_at);
end;
$$;
revoke all on function public.start_whatsapp_verification() from public, anon;
grant execute on function public.start_whatsapp_verification() to authenticated, service_role;

-- 5. Le webhook confirme (service_role uniquement)
--    Statuts : verified | already | unknown_code | expired | mismatch | number_changed | taken
create or replace function public.confirm_whatsapp_verification(p_from text, p_code text, p_message_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.whatsapp_verifications%rowtype;
  v_shop public.shops%rowtype;
  v_from text := regexp_replace(coalesce(p_from, ''), '\D', '', 'g');
begin
  if p_message_id is not null and exists (select 1 from public.whatsapp_verifications where wa_message_id = p_message_id) then
    return jsonb_build_object('status', 'already');
  end if;

  select * into v_row from public.whatsapp_verifications
  where code = p_code and status = 'pending'
  for update;
  if v_row.id is null then return jsonb_build_object('status', 'unknown_code'); end if;

  if v_row.expires_at <= now() then
    update public.whatsapp_verifications set status = 'expired' where id = v_row.id;
    return jsonb_build_object('status', 'expired', 'shop_id', v_row.shop_id);
  end if;

  -- Le cœur de la vérification : le message doit venir du numéro de la boutique.
  if v_from <> regexp_replace(v_row.phone, '\D', '', 'g') then
    update public.whatsapp_verifications
      set status = 'rejected', reject_reason = 'mismatch', from_number = v_from, wa_message_id = p_message_id
      where id = v_row.id;
    return jsonb_build_object('status', 'mismatch', 'shop_id', v_row.shop_id);
  end if;

  select * into v_shop from public.shops where id = v_row.shop_id for update;
  if v_shop.id is null or regexp_replace(v_shop.whatsapp, '\D', '', 'g') <> v_from then
    update public.whatsapp_verifications
      set status = 'rejected', reject_reason = 'number_changed', from_number = v_from, wa_message_id = p_message_id
      where id = v_row.id;
    return jsonb_build_object('status', 'number_changed', 'shop_id', v_row.shop_id);
  end if;

  if exists (
    select 1 from public.shops s
    where s.id <> v_shop.id and s.whatsapp_verified_at is not null
      and regexp_replace(s.whatsapp, '\D', '', 'g') = v_from
  ) then
    update public.whatsapp_verifications
      set status = 'rejected', reject_reason = 'taken', from_number = v_from, wa_message_id = p_message_id
      where id = v_row.id;
    return jsonb_build_object('status', 'taken', 'shop_id', v_row.shop_id);
  end if;

  update public.shops set whatsapp_verified_at = now() where id = v_shop.id;
  update public.whatsapp_verifications
    set status = 'verified', verified_at = now(), from_number = v_from, wa_message_id = p_message_id
    where id = v_row.id;
  return jsonb_build_object('status', 'verified', 'shop_id', v_shop.id, 'owner_id', v_shop.owner_id);
end;
$$;
revoke all on function public.confirm_whatsapp_verification(text, text, text) from public, anon, authenticated;
grant execute on function public.confirm_whatsapp_verification(text, text, text) to service_role;

-- 6. Market : exigence activable par date (null = pas encore exigée)
alter table public.market_settings add column if not exists whatsapp_required_from timestamptz;

create or replace function public.market_shop_ids()
returns table (shop_id uuid, is_pro boolean)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select coalesce(s.launch_until > now(), false) as launch_active, s.launch_min_items, s.pro_min_items,
           s.wa_required_from
    from (select (select ms.launch_until from public.market_settings ms where ms.id) as launch_until,
                 coalesce((select ms.launch_min_items from public.market_settings ms where ms.id), 6) as launch_min_items,
                 coalesce((select ms.pro_min_items from public.market_settings ms where ms.id), 3) as pro_min_items,
                 (select ms.whatsapp_required_from from public.market_settings ms where ms.id) as wa_required_from) s
  ),
  cand as (
    select s.id, public.user_is_pro(s.owner_id) as is_pro,
           s.whatsapp_verified_at is not null as wa_ok,
           (select count(*) from public.products p
            where p.shop_id = s.id and p.status in ('active', 'sold_out')
              and public.market_item_visible(p.id, p.subject_type)) as n
    from public.shops s
    where s.status = 'published'
      -- Secteur vide accepté ; seuls pharmacie, hôtellerie et voyage restent hors du Market.
      and (s.industry is null or s.industry not in ('pharmacy', 'hotel', 'travel'))
  )
  select c.id, c.is_pro
  from cand c cross join cfg
  where ((c.is_pro and c.n >= cfg.pro_min_items)
      or (cfg.launch_active and c.n >= cfg.launch_min_items))
    and (cfg.wa_required_from is null or now() < cfg.wa_required_from or c.wa_ok);
$$;
revoke all on function public.market_shop_ids() from public, anon, authenticated;
grant execute on function public.market_shop_ids() to service_role;

-- 7. Statut Market du vendeur : + whatsapp_verified / whatsapp_required_from
create or replace function public.my_market_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shop public.shops%rowtype;
  v_pro boolean;
  v_ready integer;
  v_uncategorized integer;
  v_no_poster integer;
  v_listed boolean;
  v_cfg jsonb;
  v_wa_from timestamptz;
begin
  if auth.uid() is null then return null; end if;
  select * into v_shop from public.shops where owner_id = auth.uid() limit 1;
  if v_shop.id is null then return null; end if;
  v_pro := public.user_is_pro(auth.uid());
  v_cfg := public.market_public_settings();
  select ms.whatsapp_required_from into v_wa_from from public.market_settings ms where ms.id;
  select count(*) into v_ready from public.products p
  where p.shop_id = v_shop.id and p.status in ('active', 'sold_out') and public.market_item_visible(p.id, p.subject_type);
  select count(*) into v_uncategorized from public.products p
  where p.shop_id = v_shop.id and p.status in ('active', 'sold_out') and p.market_category is null;
  select count(*) into v_no_poster from public.products p
  where p.shop_id = v_shop.id and p.status in ('active', 'sold_out') and p.subject_type = 'service'
    and p.display_media = 'poster' and public.product_poster_key(p.id) is null;
  v_listed := v_shop.id in (select m.shop_id from public.market_shop_ids() m);
  return jsonb_build_object(
    'published', v_shop.status = 'published',
    'suspended', v_shop.status = 'suspended',
    'eligible_industry', v_shop.industry is null or v_shop.industry not in ('pharmacy', 'hotel', 'travel'),
    'pro', v_pro,
    'products_with_photo', v_ready,
    'uncategorized', v_uncategorized,
    'services_without_poster', v_no_poster,
    'listed', v_listed,
    'listed_via', case when not v_listed then null when v_pro and v_ready >= (v_cfg->>'pro_min_items')::int then 'pro' else 'launch' end,
    'launch_active', (v_cfg->>'launch_active')::boolean,
    'launch_until', v_cfg->'launch_until',
    'launch_min_items', (v_cfg->>'launch_min_items')::int,
    'pro_min_items', (v_cfg->>'pro_min_items')::int,
    'whatsapp_verified', v_shop.whatsapp_verified_at is not null,
    'whatsapp_required_from', v_wa_from
  );
end;
$$;
revoke all on function public.my_market_status() from public, anon;
grant execute on function public.my_market_status() to authenticated, service_role;
