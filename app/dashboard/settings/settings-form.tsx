"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { updateProfile } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PhoneInput } from "@/components/phone-input";
import { useLocale } from "@/lib/locale-context";

export function SettingsForm({
  fullName: initialFullName,
  phone: initialPhone,
  whatsapp: initialWhatsapp,
  error,
  message,
}: {
  fullName: string;
  phone: string;
  whatsapp: string;
  error?: string;
  message?: string;
}) {
  const { t } = useLocale();
  const [phone, setPhone] = React.useState(initialPhone);
  const [whatsapp, setWhatsapp] = React.useState(initialWhatsapp);
  const [sameAsPhone, setSameAsPhone] = React.useState(initialPhone !== "" && initialPhone === initialWhatsapp);

  const whatsappValue = sameAsPhone ? phone : whatsapp;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-[400px]">
        <Link href="/dashboard" className="mb-6 flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {t("settings.back")}
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.title")}</CardTitle>
            <CardDescription>{t("settings.desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {message && (
              <p className="mb-4 rounded-lg bg-accent px-3.5 py-2.5 text-sm text-accent-foreground">{message}</p>
            )}
            {error && (
              <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                {error}
              </p>
            )}
            <form action={updateProfile} className="flex flex-col gap-4">
              <input type="hidden" name="phone" value={`+221${phone}`} />
              <input type="hidden" name="whatsapp" value={`+221${whatsappValue}`} />

              <div className="flex flex-col gap-1.5">
                <label htmlFor="fullName" className="text-sm font-medium">
                  {t("auth.fullName")}
                </label>
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  defaultValue={initialFullName}
                  placeholder={t("auth.fullNamePlaceholder")}
                  required
                  autoComplete="name"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="phone-local" className="text-sm font-medium">
                  {t("auth.phone")}
                </label>
                <PhoneInput id="phone-local" value={phone} onChange={setPhone} placeholder={t("auth.phonePlaceholder")} required />
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
                  required
                  disabled={sameAsPhone}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="currentPassword" className="text-sm font-medium">
                  {t("settings.currentPassword")}
                </label>
                <Input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  placeholder={t("settings.currentPasswordPlaceholder")}
                  required
                  autoComplete="current-password"
                />
              </div>

              <Button type="submit" variant="accent" size="lg" className="mt-2 w-full">
                {t("settings.save")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
