-- ─────────────────────────────────────────────────────────────────────────────
-- 0027 — Studio : compteur de partages (à exécuter après 0026)
--
-- Le bouton « Publier sur Instagram / Facebook / TikTok / Story / Statut » ouvre le partage du
-- téléphone avec le visuel (la légende est copiée). On compte ces partages à part des
-- téléchargements, pour savoir quels réseaux les commerçants utilisent vraiment.
-- Sans cette migration, l'application fonctionne : le partage n'est simplement pas compté.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.marketing_posts add column if not exists share_count integer not null default 0;
alter table public.marketing_posts add column if not exists last_shared_at timestamptz;

create or replace function public.marketing_post_track(p_post_id uuid, p_action text)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.marketing_posts
     set copy_count = copy_count + case when p_action = 'copy' then 1 else 0 end,
         download_count = download_count + case when p_action = 'download' then 1 else 0 end,
         share_count = share_count + case when p_action = 'share' then 1 else 0 end,
         last_shared_at = case when p_action = 'share' then now() else last_shared_at end
   where id = p_post_id and owner_id = auth.uid();
$$;

revoke all on function public.marketing_post_track(uuid, text) from public;
revoke all on function public.marketing_post_track(uuid, text) from anon;
grant execute on function public.marketing_post_track(uuid, text) to authenticated;
