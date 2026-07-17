"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const phone = formData.get("phone") as string;
  const password = formData.get("password") as string;
  const next = (formData.get("next") as string) || "/dashboard";

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ phone, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signup(formData: FormData) {
  const fullName = formData.get("fullName") as string;
  const phone = formData.get("phone") as string;
  const whatsapp = (formData.get("whatsapp") as string) || phone;
  const password = formData.get("password") as string;

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    phone,
    password,
    options: {
      data: { full_name: fullName, whatsapp_number: whatsapp },
    },
  });

  if (error) {
    redirect(`/register?error=${encodeURIComponent(error.message)}`);
  }

  if (!data.session) {
    // Le provider Phone a la confirmation SMS activée côté Supabase : pas de session immédiate.
    redirect(`/login?message=${encodeURIComponent("Compte créé. Connecte-toi avec ton numéro et ton mot de passe.")}`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function updateProfile(formData: FormData) {
  const fullName = formData.get("fullName") as string;
  const phone = formData.get("phone") as string;
  const whatsapp = (formData.get("whatsapp") as string) || phone;
  const currentPassword = formData.get("currentPassword") as string;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.phone) {
    redirect("/login");
  }

  // On revalide le mot de passe avant de toucher au numéro de connexion,
  // pour éviter qu'une session laissée ouverte permette de le changer sans autorisation.
  const { error: authError } = await supabase.auth.signInWithPassword({
    phone: user.phone,
    password: currentPassword,
  });

  if (authError) {
    redirect(`/dashboard/settings?error=${encodeURIComponent("Mot de passe actuel incorrect.")}`);
  }

  const { error } = await supabase.auth.updateUser({
    phone,
    data: { full_name: fullName, whatsapp_number: whatsapp },
  });

  if (error) {
    redirect(`/dashboard/settings?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard/settings");
  redirect(`/dashboard/settings?message=${encodeURIComponent("Profil mis à jour.")}`);
}

export async function logout() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
