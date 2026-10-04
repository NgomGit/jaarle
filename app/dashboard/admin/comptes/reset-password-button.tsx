"use client";

import * as React from "react";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/storefront/whatsapp-icon";
import { resetUserPassword, type ResetPasswordResult } from "./actions";

/** Bouton « Réinitialiser » (avec confirmation) puis affichage unique du mot de passe provisoire. */
export function ResetPasswordButton({ userId, name }: { userId: string; name: string | null }) {
  const [step, setStep] = React.useState<"idle" | "confirm" | "loading">("idle");
  const [result, setResult] = React.useState<ResetPasswordResult | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function run() {
    setStep("loading");
    setResult(await resetUserPassword(userId));
    setStep("idle");
  }

  if (result?.ok) {
    const first = (result.name ?? name ?? "").split(" ")[0];
    const message =
      `Bonjour${first ? ` ${first}` : ""}, voici ton mot de passe provisoire Jaarle : ${result.tempPassword}\n` +
      `Connecte-toi sur https://jaarle.com/login avec ton numéro, puis choisis un nouveau mot de passe.`;
    const phoneDigits = (result.phone ?? "").replace(/\D/g, "");
    return (
      <div className="w-full rounded-xl border border-success/30 bg-success/10 p-3 text-sm sm:w-auto">
        <p className="text-xs font-medium text-success">Mot de passe provisoire (affiché une seule fois)</p>
        <div className="mt-1.5 flex items-center gap-2">
          <code className="rounded-lg bg-card px-2.5 py-1 font-mono text-base font-semibold tracking-wider">{result.tempPassword}</code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(result.tempPassword).then(() => setCopied(true));
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-card"
            aria-label="Copier"
          >
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        {phoneDigits && (
          <Button size="sm" variant="secondary" className="mt-2.5" asChild>
            <a href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
              <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
              Envoyer sur WhatsApp
            </a>
          </Button>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Il devra choisir un nouveau mot de passe à sa connexion.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {step === "confirm" ? (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setStep("idle")}>
            Annuler
          </Button>
          <Button size="sm" variant="destructive" onClick={() => void run()}>
            Confirmer la réinitialisation
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="secondary" disabled={step === "loading"} onClick={() => setStep("confirm")}>
          {step === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
          Réinitialiser le mot de passe
        </Button>
      )}
      {result && !result.ok && <p className="text-xs text-destructive">{result.error}</p>}
    </div>
  );
}
