import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { data: creation, error } = await supabase
    .from("creations")
    .select("id, photo_path, poster_path, poster_path_2, extra_photo_paths")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (error || !creation) {
    return NextResponse.json({ error: "Création introuvable." }, { status: 404 });
  }

  // Fichiers de la création et de toutes ses versions. Suppression par le serveur : les affiches
  // nettes ne sont plus accessibles au vendeur depuis le navigateur (migration 0034). Seuls les
  // fichiers de son propre dossier sont supprimés.
  const { data: versions } = await supabase.from("creation_versions").select("poster_path").eq("creation_id", creation.id).eq("user_id", user.id);
  const paths = [
    creation.photo_path,
    creation.poster_path,
    creation.poster_path_2,
    ...(creation.extra_photo_paths ?? []),
    ...((versions ?? []) as { poster_path: string | null }[]).map((v) => v.poster_path),
  ].filter((p): p is string => !!p && p.startsWith(`${user.id}/`));
  if (paths.length > 0) {
    await createAdminClient().storage.from("creations").remove([...new Set(paths)]);
  }

  const { error: deleteError } = await supabase.from("creations").delete().eq("id", creation.id).eq("user_id", user.id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
