"use client";

import * as React from "react";
import { KeyRound } from "lucide-react";
import { changePassword, logout } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { useLocale } from "@/lib/locale-context";

export function ChangePasswordForm({ error }: { error?: string }) {
  const { t } = useLocale();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex justify-center">
          <Logo variant="image" className="text-xl [&_img]:h-9 [&_img]:w-9" />
        </div>
        <Card>
          <CardHeader>
            <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <KeyRound className="h-5 w-5" />
            </span>
            <CardTitle>{t("auth.changeTitle")}</CardTitle>
            <CardDescription>{t("auth.changeDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{error}</p>
            )}
            <form action={changePassword} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className="text-sm font-medium">
                  {t("auth.newPassword")}
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("auth.passwordPlaceholder")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="confirmPassword" className="text-sm font-medium">
                  {t("auth.confirmPassword")}
                </label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
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
                {t("auth.changeSubmit")}
              </Button>
            </form>
            <form action={logout} className="mt-5 text-center">
              <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
                {t("auth.logout")}
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
