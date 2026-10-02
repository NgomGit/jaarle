"use client";

import * as React from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallMode } from "@/lib/pwa/install";
import { enablePush, syncPushSubscription, usePushState } from "@/lib/pwa/push";
import { installCardVisible } from "./install-app";

// Invitation à activer les notifications (accueil du tableau de bord).
// On ne déclenche JAMAIS la fenêtre du navigateur d'office : elle ne s'ouvre que si le vendeur
// touche « Activer » (un refus est quasi définitif). Masquée tant que la carte d'installation
// est affichée (une invitation à la fois) ; « Plus tard » la cache 14 jours.

const DISMISS_KEY = "jaarle-push-invite-dismissed";
const DISMISS_DAYS = 14;

function dismissedRecently(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export function PushInviteCard() {
  const [state, setState] = usePushState();
  const installMode = useInstallMode();
  const [hidden, setHidden] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setHidden(dismissedRecently());
    syncPushSubscription().catch(() => undefined);
  }, []);

  if (hidden || state !== "off" || installCardVisible(installMode)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* rien */
    }
    setHidden(true);
  };

  return (
    <div className="relative mb-5 flex gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-card text-primary">
        <Bell className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1 pr-6">
        <p className="text-sm font-semibold">Sois prévenu à chaque commande</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Jaarle t&apos;envoie une notification dès qu&apos;un client t&apos;envoie son panier sur WhatsApp, pour lui répondre vite.</p>
        <Button
          size="sm"
          variant="accent"
          className="mt-3"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await enablePush();
            setState(res.state);
            setError(res.error ?? null);
            setBusy(false);
          }}
        >
          <Bell className="h-4 w-4" /> Activer les notifications
        </Button>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
      <button type="button" onClick={dismiss} aria-label="Plus tard" className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
