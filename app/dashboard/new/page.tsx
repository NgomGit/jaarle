import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewCreationWizard } from "@/components/dashboard/new-creation-wizard";

export default async function NewCreationPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const defaultPhone = (user.user_metadata?.whatsapp_number as string | undefined) || user.phone || "";

  return (
    <Suspense>
      <NewCreationWizard userId={user.id} defaultPhone={defaultPhone} />
    </Suspense>
  );
}
