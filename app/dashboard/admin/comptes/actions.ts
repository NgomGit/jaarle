"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction, requireAdmin } from "@/lib/admin/guard";
import { generateTemporaryPassword } from "@/lib/auth/password";

export type ResetPasswordResult =
  | { ok: true; tempPassword: string; phone: string | null; name: string | null }
  | { ok: false; error: string };

/**
 * Admin : remplace le mot de passe d'un compte par un mot de passe provisoire et oblige
 * l'utilisateur à en choisir un nouveau à sa prochaine connexion (app_metadata.must_change_password).
 * Le mot de passe provisoire n'est renvoyé qu'une fois, à l'admin, et n'est jamais journalisé.
 */
export async function resetUserPassword(userId: string): Promise<ResetPasswordResult> {
  const { userId: adminId } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/.test(userId)) return { ok: false, error: "Compte invalide." };

  const admin = createAdminClient();
  const { data, error: getError } = await admin.auth.admin.getUserById(userId);
  if (getError || !data.user) return { ok: false, error: "Compte introuvable." };
  const user = data.user;

  const tempPassword = generateTemporaryPassword();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: tempPassword,
    app_metadata: { ...user.app_metadata, must_change_password: true },
  });
  if (error) return { ok: false, error: `Échec : ${error.message}` };

  await logAdminAction(adminId, "password_reset", "user", userId, { phone: user.phone ?? null });
  return {
    ok: true,
    tempPassword,
    phone: user.phone ?? null,
    name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null,
  };
}
