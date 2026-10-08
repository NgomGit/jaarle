"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { forgetDevicePushSubscription } from "@/lib/push/device";
import { createAdminClient } from "@/lib/supabase/admin";
import { MIN_PASSWORD_LENGTH, mustChangePassword } from "@/lib/auth/password";
import { TERMS_VERSION } from "@/lib/legal/terms";

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
  const { data, error } = await supabase.auth.signInWithPassword({ phone, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  // Mot de passe provisoire donné par Jaarle : il faut d'abord en choisir un nouveau.
  if (mustChangePassword(data.user)) redirect("/mot-de-passe");
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

  // Conditions générales : case obligatoire (version et date gardées dans le compte).
  if (formData.get("acceptTerms") !== "on") {
    redirect(`/register?error=${encodeURIComponent("Accepte les conditions générales d'utilisation pour créer ton compte.")}`);
  }

  // Numéro sénégalais complet obligatoire (le numéro sert d'identifiant et de contact WhatsApp).
  if (!SENEGAL_PHONE.test(phone) || !SENEGAL_PHONE.test(whatsapp)) {
    redirect(`/register?error=${encodeURIComponent("Numéro invalide : saisis les 9 chiffres, ex. 77 123 45 67.")}`);
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    phone,
    password,
    options: {
      data: {
        full_name: fullName,
        whatsapp_number: whatsapp,
        terms_version: TERMS_VERSION,
        terms_accepted_at: new Date().toISOString(),
        ...(ref ? { ref } : {}),
      },
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

/**
 * Nouveau mot de passe choisi par l'utilisateur connecté — obligatoire après une réinitialisation
 * par l'admin (app_metadata.must_change_password). Écrit avec la clé service_role : pas de
 * « ré-authentification récente » exigée par Supabase, et le drapeau est levé dans le même appel.
 */
export async function changePassword(formData: FormData) {
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirmPassword") || "");
  const fail = (msg: string) => redirect(`/mot-de-passe?error=${encodeURIComponent(msg)}`);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.phone) redirect("/login");

  if (password.length < MIN_PASSWORD_LENGTH) fail(`Au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  if (password !== confirm) fail("Les mots de passe ne correspondent pas.");

  // Refuse de garder le mot de passe provisoire (client isolé : la session en cours n'est pas touchée).
  const verifier = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: sameError } = await verifier.auth.signInWithPassword({ phone: user.phone, password });
  if (!sameError) fail("Choisis un mot de passe différent de l'actuel.");

  const { error } = await createAdminClient().auth.admin.updateUserById(user.id, {
    password,
    app_metadata: { ...user.app_metadata, must_change_password: false },
  });
  if (error) fail(error.message);

  // Rafraîchit la session (le jeton contient app_metadata) puis direction le tableau de bord.
  await supabase.auth.refreshSession().then(undefined, () => undefined);
  revalidatePath("/", "layout");
  redirect(`/dashboard?message=${encodeURIComponent("Mot de passe mis à jour.")}`);
}

/**
 * Paramètres → « Mot de passe » : l'utilisateur connecté change son mot de passe en confirmant
 * l'actuel (une session restée ouverte sur un autre téléphone ne suffit pas).
 */
export async function updatePassword(formData: FormData) {
  const current = String(formData.get("currentPassword") || "");
  const password = String(formData.get("newPassword") || "");
  const confirm = String(formData.get("confirmNewPassword") || "");
  const back = (key: "pw_error" | "pw_ok", msg: string) => redirect(`/dashboard/settings?${key}=${encodeURIComponent(msg)}#mot-de-passe`);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.phone) redirect("/login");

  if (password.length < MIN_PASSWORD_LENGTH) back("pw_error", `Le nouveau mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  if (password !== confirm) back("pw_error", "Les nouveaux mots de passe ne correspondent pas.");
  if (password === current) back("pw_error", "Le nouveau mot de passe doit être différent de l'actuel.");

  // Vérification de l'actuel avec un client isolé (la session en cours n'est jamais touchée).
  const verifier = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: authError } = await verifier.auth.signInWithPassword({ phone: user.phone, password: current });
  if (authError) back("pw_error", "Mot de passe actuel incorrect.");

  const { error } = await createAdminClient().auth.admin.updateUserById(user.id, {
    password,
    app_metadata: { ...user.app_metadata, must_change_password: false },
  });
  if (error) back("pw_error", error.message);

  back("pw_ok", "Mot de passe modifié.");
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
