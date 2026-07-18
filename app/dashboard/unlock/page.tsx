import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UnlockConfirm } from "@/components/dashboard/unlock-confirm";

export default async function UnlockPage({ searchParams }: { searchParams: { ref?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!searchParams.ref) {
    redirect("/dashboard/creations");
  }

  return <UnlockConfirm refCommand={searchParams.ref} />;
}
