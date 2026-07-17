"use client";

import * as React from "react";
import Link from "next/link";
import { login } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { PhoneInput } from "@/components/phone-input";
import { useLocale } from "@/lib/locale-context";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string; next?: string };
}) {
  const { t } = useLocale();
  const [phone, setPhone] = React.useState("");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-[400px]">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo />
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>{t("auth.loginTitle")}</CardTitle>
            <CardDescription>{t("auth.loginDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {searchParams.message && (
              <p className="mb-4 rounded-lg bg-accent px-3.5 py-2.5 text-sm text-accent-foreground">
                {searchParams.message}
              </p>
            )}
            {searchParams.error && (
              <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                {searchParams.error}
              </p>
            )}
            <form action={login} className="flex flex-col gap-4">
              <input type="hidden" name="next" value={searchParams.next ?? ""} />
              <input type="hidden" name="phone" value={`+221${phone}`} />
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
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" variant="accent" size="lg" className="mt-2 w-full">
                {t("auth.loginSubmit")}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {t("auth.noAccount")}{" "}
              <Link href="/register" className="font-semibold text-primary hover:underline">
                {t("auth.createOne")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
