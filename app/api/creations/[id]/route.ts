import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    .select("id, photo_path, poster_path")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (error || !creation) {
    return NextResponse.json({ error: "Création introuvable." }, { status: 404 });
  }

  const paths = [creation.photo_path, creation.poster_path].filter((p): p is string => !!p);
  if (paths.length > 0) {
    await supabase.storage.from("creations").remove(paths);
  }

  const { error: deleteError } = await supabase.from("creations").delete().eq("id", creation.id).eq("user_id", user.id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
