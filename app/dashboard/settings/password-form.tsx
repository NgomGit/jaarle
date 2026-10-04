"use client";

import * as React from "react";
import { updatePassword } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/lib/locale-context";

/** Paramètres → changer son mot de passe (actuel + nouveau + confirmation). */
export function PasswordForm({ error, message }: { error?: string; message?: string }) {
  const { t } = useLocale();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <div id="mot-de-passe" className="mt-4 max-w-[480px] scroll-mt-20">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.passwordTitle")}</CardTitle>
          <CardDescription>{t("settings.passwordDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {message && <p className="mb-4 rounded-lg bg-accent px-3.5 py-2.5 text-sm text-accent-foreground">{message}</p>}
          {error && (
            <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{error}</p>
          )}
          <form action={updatePassword} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pw-current" className="text-sm font-medium">
                {t("settings.currentPassword")}
              </label>
              <Input id="pw-current" name="currentPassword" type="password" required autoComplete="current-password" placeholder={t("settings.currentPasswordPlaceholder")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pw-new" className="text-sm font-medium">
                {t("auth.newPassword")}
              </label>
              <Input
                id="pw-new"
                name="newPassword"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.passwordPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("settings.passwordHint")}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pw-confirm" className="text-sm font-medium">
                {t("auth.confirmPassword")}
              </label>
              <Input
                id="pw-confirm"
                name="confirmNewPassword"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={t("auth.confirmPasswordPlaceholder")}
              />
              {mismatch && <p className="text-xs text-destructive">{t("auth.passwordMismatch")}</p>}
            </div>
            <Button type="submit" variant="accent" size="lg" className="mt-2 w-full" disabled={password.length < 6 || mismatch}>
              {t("settings.passwordSubmit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
