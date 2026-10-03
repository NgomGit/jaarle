"use client";

import * as React from "react";
import { Copy, Download, EllipsisVertical, ExternalLink, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openInBrowserHref, promptInstall, useInstallMode, type InstallMode } from "@/lib/pwa/install";
import { cn } from "@/lib/utils";

// Invitation à installer Jaarle sur l'écran d'accueil (tableau de bord), adaptée à l'appareil
// détecté (lib/pwa/install.ts) :
// • Android / ordinateur (Chrome, Edge, Samsung) : bouton « Installer » (fenêtre native) ;
// • Android sans bouton natif : menu ⋮ → « Ajouter à l'écran d'accueil » ;
// • iPhone, Safari : Partager → « Sur l'écran d'accueil » ;
// • iPhone, Chrome / Edge / Firefox : Partager (barre d'adresse) → « Sur l'écran d'accueil » ;
// • Facebook, Instagram, TikTok… : bouton qui ouvre Jaarle dans Chrome (Android) ou Safari (iPhone),
//   et « Copier le lien » en secours.
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

function Steps({ steps, className }: { steps: React.ReactNode[]; className?: string }) {
  return (
    <ol className={cn("flex flex-col gap-1.5 text-[13px] text-muted-foreground", className)}>
      {steps.map((step, i) => (
        <li key={i} className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-foreground">{i + 1}.</span> {step}
        </li>
      ))}
    </ol>
  );
}

const ShareIcon = () => <Share className="inline h-4 w-4 text-foreground" aria-label="Partager" />;
const AddIcon = () => <SquarePlus className="inline h-4 w-4 text-foreground" aria-hidden />;
const MenuIcon = () => <EllipsisVertical className="inline h-4 w-4 text-foreground" aria-label="Menu" />;

function OpenInBrowser({ mode, className }: { mode: InstallMode; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  const href = openInBrowserHref(mode);
  const browser = mode === "android-in-app" ? "Chrome" : "Safari";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/dashboard`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="text-[13px] text-muted-foreground">
        Tu es dans le navigateur d&apos;une autre application : ouvre Jaarle dans <strong className="text-foreground">{browser}</strong> pour l&apos;installer.
      </p>
      <div className="flex flex-wrap gap-2">
        {href && (
          <Button size="sm" variant="accent" asChild>
            <a href={href}>
              <ExternalLink className="h-4 w-4" /> Ouvrir dans {browser}
            </a>
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={copy}>
          <Copy className="h-4 w-4" /> {copied ? "Lien copié !" : "Copier le lien"}
        </Button>
      </div>
      {copied && <p className="text-xs text-muted-foreground">Colle-le dans {browser}, puis reviens ici.</p>}
    </div>
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
  switch (mode) {
    case "prompt":
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
    case "android-manual":
      return (
        <Steps
          className={className}
          steps={[
            <>Touche <MenuIcon /> en haut à droite du navigateur</>,
            <>Choisis « Installer l&apos;application » ou « Ajouter à l&apos;écran d&apos;accueil »</>,
          ]}
        />
      );
    case "ios-safari":
      return (
        <Steps
          className={className}
          steps={[
            <>Touche <ShareIcon /> Partager (en bas de Safari, ou dans le menu •••)</>,
            <>Choisis <AddIcon /> « Sur l&apos;écran d&apos;accueil », puis « Ajouter »</>,
          ]}
        />
      );
    case "ios-browser":
      return (
        <Steps
          className={className}
          steps={[
            <>Touche <ShareIcon /> Partager, à droite de l&apos;adresse jaarle.com</>,
            <>Choisis <AddIcon /> « Sur l&apos;écran d&apos;accueil », puis « Ajouter »</>,
          ]}
        />
      );
    case "android-in-app":
    case "ios-in-app":
      return <OpenInBrowser mode={mode} className={className} />;
    default:
      return null;
  }
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
