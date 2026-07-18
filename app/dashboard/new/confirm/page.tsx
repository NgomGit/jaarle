import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreationConfirm } from "@/components/dashboard/creation-confirm";

export default async function ConfirmPage({ searchParams }: { searchParams: { ref?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!searchParams.ref) {
    redirect("/dashboard/new");
  }

  return <CreationConfirm refCommand={searchParams.ref} />;
}
