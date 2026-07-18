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

  return (
    <Suspense>
      <NewCreationWizard userId={user.id} />
    </Suspense>
  );
}
