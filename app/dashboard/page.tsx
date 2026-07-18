import { createClient } from "@/lib/supabase/server";
import { listCreations, countCreationsSince } from "@/lib/supabase/creations";
import { DashboardHome } from "@/components/dashboard/dashboard-home";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const displayName = (user?.user_metadata?.full_name as string | undefined) || user?.phone || "";

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [recentCreations, createdThisMonth] = await Promise.all([
    listCreations(supabase, 4),
    countCreationsSince(supabase, startOfMonth),
  ]);

  return <DashboardHome displayName={displayName} recentCreations={recentCreations} createdThisMonth={createdThisMonth} />;
}
