import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const fullName = (user.user_metadata?.full_name as string | undefined) || "";
  const phone = (user.phone || "").replace(/^\+?221/, "");
  const whatsapp = ((user.user_metadata?.whatsapp_number as string | undefined) || "").replace(/^\+?221/, "");

  return (
    <SettingsForm
      fullName={fullName}
      phone={phone}
      whatsapp={whatsapp}
      error={searchParams.error}
      message={searchParams.message}
    />
  );
}
