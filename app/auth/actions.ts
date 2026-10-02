"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { forgetDevicePushSubscription } from "@/lib/push/device";

/**
 * Destination après connexion : uniquement une page de Jaarle (« /… »). Refuse les adresses
 * externes (« https://… », « //site », « /\site ») — sinon un lien piégé
 * /login?next=https://faux-site renverrait le vendeur ailleurs juste après sa connexion.
 */
function safeNextPath(value: FormDataEntryValue | null): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\") || /[\u0000-\u001f]/.test(v)) return "/dashboard";
  return v;
}

/** +221 suivi de 9 chiffres (mobiles 7x, fixes 3x). */
const SENEGAL_PHONE = /^\+221[37]\d{8}$/;

export async function login(formData: FormData) {
  const phone = formData.get("phone") as string;
  const password = formData.get("password") as string;
  const next = safeNextPath(formData.get("next"));

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
  // Jaarle 2.0 : code de parrainage (lu par le trigger SQL handle_new_account) et offre choisie.
  const ref = String(formData.get("ref") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  const plan = String(formData.get("plan") || "");
  const code = String(formData.get("code") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 30);
  const next = plan === "pro" ? `/dashboard/abonnement${code ? `?code=${encodeURIComponent(code)}` : ""}` : "/dashboard";

  // Numéro sénégalais complet obligatoire (le numéro sert d'identifiant et de contact WhatsApp).
  if (!SENEGAL_PHONE.test(phone) || !SENEGAL_PHONE.test(whatsapp)) {
    redirect(`/register?error=${encodeURIComponent("Numéro invalide : saisis les 9 chiffres, ex. 77 123 45 67.")}`);
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    phone,
    password,
    options: {
      data: { full_name: fullName, whatsapp_number: whatsapp, ...(ref ? { ref } : {}) },
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
  redirect(next);
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

  // On revalide le mot de passe avant de toucher au numéro de connexion, pour éviter
  // qu'une session laissée ouverte permette de le changer sans autorisation. On utilise un
  // client Supabase isolé (sans persistance de session) : signInWithPassword sur le client
  // lié aux cookies de la requête écrase la session active même en cas d'échec, ce qui
  // déconnecterait l'utilisateur simplement parce qu'il a fait une faute de frappe.
  const verifier = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: authError } = await verifier.auth.signInWithPassword({
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Cet appareil ne doit plus recevoir les notifications de ce compte.
  if (user) await forgetDevicePushSubscription(user.id);
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
