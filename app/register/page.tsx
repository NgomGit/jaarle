"use client";

import * as React from "react";
import Link from "next/link";
import { signup } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { PhoneInput } from "@/components/phone-input";
import { useLocale } from "@/lib/locale-context";

export default function RegisterPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const { t } = useLocale();
  const [phone, setPhone] = React.useState("");
  const [whatsapp, setWhatsapp] = React.useState("");
  const [sameAsPhone, setSameAsPhone] = React.useState(true);
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [mismatch, setMismatch] = React.useState(false);

  const whatsappValue = sameAsPhone ? phone : whatsapp;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (password !== confirmPassword) {
      e.preventDefault();
      setMismatch(true);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-[400px]">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo />
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>{t("auth.registerTitle")}</CardTitle>
            <CardDescription>{t("auth.registerDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {searchParams.error && (
              <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                {searchParams.error}
              </p>
            )}
            {mismatch && (
              <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                {t("auth.passwordMismatch")}
              </p>
            )}
            <form action={signup} onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input type="hidden" name="phone" value={`+221${phone}`} />
              <input type="hidden" name="whatsapp" value={`+221${whatsappValue}`} />

              <div className="flex flex-col gap-1.5">
                <label htmlFor="fullName" className="text-sm font-medium">
                  {t("auth.fullName")}
                </label>
                <Input id="fullName" name="fullName" type="text" placeholder={t("auth.fullNamePlaceholder")} required autoComplete="name" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="phone-local" className="text-sm font-medium">
                  {t("auth.phone")}
                </label>
                <PhoneInput
                  id="phone-local"
                  value={phone}
                  onChange={setPhone}
                  placeholder={t("auth.phonePlaceholder")}
                  autoComplete="tel-national"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="whatsapp-local" className="text-sm font-medium">
                    {t("auth.whatsapp")}
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={sameAsPhone}
                      onChange={(e) => setSameAsPhone(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-input accent-primary"
                    />
                    {t("auth.sameAsPhone")}
                  </label>
                </div>
                <PhoneInput
                  id="whatsapp-local"
                  value={whatsappValue}
                  onChange={setWhatsapp}
                  placeholder={t("auth.whatsappPlaceholder")}
                  autoComplete="tel-national"
                  required
                  disabled={sameAsPhone}
                />
                <p className="text-xs text-muted-foreground">{t("auth.whatsappHint")}</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className="text-sm font-medium">
                  {t("auth.password")}
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder={t("auth.passwordPlaceholder")}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setMismatch(false);
                  }}
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
                  placeholder={t("auth.confirmPasswordPlaceholder")}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setMismatch(false);
                  }}
                />
              </div>
              <Button type="submit" variant="accent" size="lg" className="mt-2 w-full">
                {t("auth.registerSubmit")}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {t("auth.hasAccount")}{" "}
              <Link href="/login" className="font-semibold text-primary hover:underline">
                {t("auth.signIn")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
