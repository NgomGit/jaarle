"use client";

import * as React from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { promptInstall, useInstallMode, type InstallMode } from "@/lib/pwa/install";
import { cn } from "@/lib/utils";

// Invitation à installer Jaarle sur l'écran d'accueil (tableau de bord).
// • Android / Chrome : bouton « Installer » (fenêtre native du navigateur) ;
// • iPhone (Safari) : les 2 gestes à faire (Partager → Sur l'écran d'accueil) ;
// • navigateur intégré (Facebook, Instagram…) : ouvrir le lien dans Chrome ou Safari.
// Masquée quand l'app est déjà installée ; « Plus tard » la cache 14 jours.

const DISMISS_KEY = "jaarle-install-dismissed";
const DISMISS_DAYS = 14;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

function IosSteps({ className }: { className?: string }) {
  return (
    <ol className={cn("flex flex-col gap-1.5 text-[13px] text-muted-foreground", className)}>
      <li className="flex items-center gap-2">
        <span className="font-semibold text-foreground">1.</span> Appuie sur <Share className="inline h-4 w-4 text-foreground" aria-label="Partager" /> en bas de Safari
      </li>
      <li className="flex items-center gap-2">
        <span className="font-semibold text-foreground">2.</span> Choisis <SquarePlus className="inline h-4 w-4 text-foreground" aria-hidden /> « Sur l&apos;écran d&apos;accueil »
      </li>
    </ol>
  );
}

function InAppBrowserHint({ className }: { className?: string }) {
  return (
    <p className={cn("text-[13px] text-muted-foreground", className)}>
      Ouvre <strong className="text-foreground">jaarle.com</strong> dans Chrome (ou Safari sur iPhone) pour installer l&apos;application.
    </p>
  );
}

/** La carte d'installation est-elle affichée ? (pour n'afficher qu'une invitation à la fois) */
export function installCardVisible(mode: InstallMode): boolean {
  return mode !== "installed" && mode !== "unavailable" && !dismissedRecently();
}

/** Carte d'invitation (accueil du tableau de bord). */
export function InstallAppCard() {
  const mode = useInstallMode();
  const [hidden, setHidden] = React.useState(true);

  React.useEffect(() => setHidden(dismissedRecently()), []);

  if (hidden || mode === "installed" || mode === "unavailable") return null;

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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-xl bg-card" />
      <div className="min-w-0 flex-1 pr-6">
        <p className="text-sm font-semibold">Installe Jaarle sur ton téléphone</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Une icône sur ton écran d&apos;accueil : ta boutique et tes affiches en un geste, plus rapide, même avec une petite connexion.</p>
        <InstallAction mode={mode} className="mt-3" onDone={() => setHidden(true)} />
      </div>
      <button type="button" onClick={dismiss} aria-label="Plus tard" className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function InstallAction({ mode, className, onDone }: { mode: InstallMode; className?: string; onDone?: () => void }) {
  if (mode === "prompt") {
    return (
      <Button
        size="sm"
        variant="accent"
        className={className}
        onClick={async () => {
          if (await promptInstall()) onDone?.();
        }}
      >
        <Download className="h-4 w-4" /> Installer l&apos;application
      </Button>
    );
  }
  if (mode === "ios") return <IosSteps className={className} />;
  if (mode === "in-app-browser") return <InAppBrowserHint className={className} />;
  return null;
}

/** Lien discret « Installer l'application » (menu du tableau de bord) : toujours disponible. */
export function InstallAppMenuItem() {
  const mode = useInstallMode();
  const [open, setOpen] = React.useState(false);
  if (mode === "installed" || mode === "unavailable") return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={async () => {
          if (mode === "prompt") await promptInstall();
          else setOpen((o) => !o);
        }}
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Download className="h-4 w-4" strokeWidth={1.75} />
        Installer l&apos;application
      </button>
      {open && <InstallAction mode={mode} className="px-2.5 pb-2" />}
    </div>
  );
}
