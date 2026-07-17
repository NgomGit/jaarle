import { createClient } from "@/lib/supabase/server";
import { DashboardHome } from "@/components/dashboard/dashboard-home";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const displayName = (user?.user_metadata?.full_name as string | undefined) || user?.phone || "";

  return <DashboardHome displayName={displayName} />;
}
