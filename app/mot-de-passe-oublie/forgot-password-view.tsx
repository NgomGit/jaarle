"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { PhoneInput } from "@/components/phone-input";
import { WhatsAppIcon } from "@/components/storefront/whatsapp-icon";
import { useLocale } from "@/lib/locale-context";

// Même numéro que le bouton WhatsApp flottant (lib/auth/password.ts côté serveur).
const SUPPORT_WHATSAPP = "221771350203";

/**
 * Mot de passe oublié : la réinitialisation est faite par l'équipe Jaarle (Admin → Comptes),
 * qui renvoie un mot de passe provisoire sur WhatsApp ; l'utilisateur le change à la connexion.
 */
export function ForgotPasswordView({ initialPhone }: { initialPhone: string }) {
  const { t } = useLocale();
  const [phone, setPhone] = React.useState(initialPhone);
  const complete = /^[37]\d{8}$/.test(phone);
  const display = complete ? `+221 ${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 7)} ${phone.slice(7)}` : "";
  const href = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(t("auth.forgotMessage").replace("{phone}", display))}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-[400px]">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo variant="image" className="text-xl [&_img]:h-9 [&_img]:w-9" />
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>{t("auth.forgotTitle")}</CardTitle>
            <CardDescription>{t("auth.forgotDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="phone-local" className="text-sm font-medium">
                {t("auth.forgotPhoneLabel")}
              </label>
              <PhoneInput id="phone-local" value={phone} onChange={setPhone} placeholder={t("auth.phonePlaceholder")} autoComplete="tel-national" strict />
            </div>
            {complete ? (
              <Button variant="accent" size="lg" className="mt-5 w-full" asChild>
                <a href={href} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon className="h-5 w-5" />
                  {t("auth.forgotCta")}
                </a>
              </Button>
            ) : (
              <Button variant="accent" size="lg" className="mt-5 w-full" disabled>
                <WhatsAppIcon className="h-5 w-5" />
                {t("auth.forgotCta")}
              </Button>
            )}
            <Link href="/login" className="mt-6 flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline">
              <ArrowLeft className="h-4 w-4" />
              {t("auth.forgotBack")}
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
