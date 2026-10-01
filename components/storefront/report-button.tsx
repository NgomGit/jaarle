"use client";

import * as React from "react";
import { Check, Flag, Loader2, X } from "lucide-react";
import { REPORT_REASONS } from "@/lib/shops/reports";
import { cn } from "@/lib/utils";

/**
 * « Signaler » : petit lien discret qui ouvre une fenêtre (motif, précisions, contact facultatif).
 * Envoyé à /api/reports ; l'équipe Jaarle traite les signalements (tableau admin à venir).
 */
export function ReportButton({
  shopSlug,
  shopName,
  productSlug,
  productName,
  className,
}: {
  shopSlug: string;
  shopName: string;
  productSlug?: string;
  productName?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<string>("");
  const [details, setDetails] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [state, setState] = React.useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) {
      setError("Choisissez un motif.");
      return;
    }
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopSlug, productSlug: productSlug ?? null, reason, details, contact, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Envoi impossible.");
      setState("done");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Envoi impossible.");
    }
  }

  const subject = productName ? `le produit « ${productName} »` : `la boutique ${shopName}`;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setState((s) => (s === "done" ? s : "idle"));
        }}
        className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline", className)}
      >
        <Flag className="h-3.5 w-3.5" aria-hidden />
        {productName ? "Signaler ce produit" : "Signaler cette boutique"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 text-gray-900 shadow-xl sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id={titleId} className="text-lg font-bold">
                Signaler {subject}
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            {state === "done" ? (
              <div className="py-6 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700">
                  <Check className="h-6 w-6" />
                </span>
                <p className="mt-3 font-semibold">Merci, votre signalement a bien été envoyé.</p>
                <p className="mt-1 text-sm text-gray-500">L’équipe Jaarle l’examinera. Ne partagez jamais de code ou de mot de passe avec un vendeur.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold">Quel est le problème ?</legend>
                  <div className="flex flex-col gap-1.5">
                    {REPORT_REASONS.map((r) => (
                      <label key={r.key} className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm", reason === r.key ? "border-gray-900 bg-gray-50" : "border-gray-200")}>
                        <input type="radio" name="reason" value={r.key} checked={reason === r.key} onChange={() => setReason(r.key)} className="h-4 w-4 accent-gray-900" />
                        {r.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  Précisions (facultatif)
                  <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3} className="rounded-xl border border-gray-200 p-3 text-sm font-normal outline-none focus:border-gray-900" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  Votre téléphone ou e-mail (facultatif)
                  <input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} className="h-11 rounded-xl border border-gray-200 px-3 text-sm font-normal outline-none focus:border-gray-900" />
                  <span className="text-xs font-normal text-gray-500">Seulement si vous acceptez que l’équipe Jaarle vous recontacte.</span>
                </label>
                <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" name="website" />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button type="submit" disabled={state === "sending"} className="flex h-12 items-center justify-center gap-2 rounded-full bg-gray-900 font-semibold text-white disabled:opacity-60">
                  {state === "sending" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Envoyer le signalement
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
