"use client";

// Petit magasin partagé pour l'installation de la PWA. L'événement « beforeinstallprompt »
// (Android / Chrome ordinateur) arrive très tôt, souvent avant que le tableau de bord soit
// affiché : PwaProvider (layout racine) le capte et le garde ici pour les boutons d'installation.

import * as React from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Comment installer Jaarle sur l'appareil courant :
 * • prompt            — Android / ordinateur (Chrome, Edge, Samsung) : bouton natif « Installer » ;
 * • android-manual    — Android, navigateur sans bouton natif (déjà refusé, Firefox…) : menu ⋮ ;
 * • android-in-app    — Facebook, Instagram, TikTok… sur Android : bouton « Ouvrir dans Chrome » ;
 * • ios-safari        — iPhone / iPad, Safari : Partager → Sur l'écran d'accueil ;
 * • ios-browser       — iPhone, Chrome / Edge / Firefox (iOS 16.4+) : Partager (barre d'adresse) ;
 * • ios-in-app        — Facebook, Instagram, TikTok… sur iPhone, ou iOS trop ancien : ouvrir dans Safari ;
 * • installed         — déjà installée (ouverte depuis l'icône) ;
 * • unavailable       — ordinateur sans installation possible : rien à afficher.
 */
export type InstallMode =
  | "prompt"
  | "android-manual"
  | "android-in-app"
  | "ios-safari"
  | "ios-browser"
  | "ios-in-app"
  | "installed"
  | "unavailable";

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function captureInstallPrompt(e: Event) {
  e.preventDefault(); // on affiche notre propre bouton au bon moment
  deferred = e as BeforeInstallPromptEvent;
  emit();
}

export function markInstalled() {
  installed = true;
  deferred = null;
  emit();
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|musical_ly|Bytedance|TikTok|Snapchat|Line\/|LinkedInApp|Twitter/i;

function iosVersion(ua: string): number | null {
  const m = ua.match(/OS (\d+)_(\d+)/);
  return m ? Number(m[1]) + Number(m[2]) / 100 : null;
}

export function detectInstallMode(ua: string = typeof navigator === "undefined" ? "" : navigator.userAgent): InstallMode {
  if (typeof window === "undefined") return "unavailable";
  if (installed || isStandalone()) return "installed";
  if (deferred) return "prompt";

  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) {
    if (IN_APP.test(ua)) return "ios-in-app";
    if (/CriOS|EdgiOS|FxiOS|OPT\//i.test(ua)) {
      // Chrome, Edge, Firefox sur iPhone savent ajouter à l'écran d'accueil depuis iOS 16.4.
      const v = iosVersion(ua);
      return v !== null && v < 16.4 ? "ios-in-app" : "ios-browser";
    }
    return "ios-safari";
  }

  if (/Android/i.test(ua)) {
    // Navigateurs intégrés aux réseaux sociaux, ou WebView générique (« ; wv) »).
    if (IN_APP.test(ua) || /; wv\)/.test(ua)) return "android-in-app";
    return "android-manual";
  }
  return "unavailable";
}

/** Lien qui ouvre la page courante dans le vrai navigateur (Chrome sur Android, Safari sur iPhone). */
export function openInBrowserHref(mode: InstallMode, path = "/dashboard"): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.host;
  if (mode === "android-in-app") {
    const fallback = encodeURIComponent(`https://${host}${path}`);
    return `intent://${host}${path}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
  }
  // iOS 17+ : ouvre Safari depuis un navigateur intégré (sans effet sur les versions plus anciennes).
  if (mode === "ios-in-app") return `x-safari-https://${host}${path}`;
  return null;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === "accepted") installed = true;
  emit();
  return outcome === "accepted";
}

/** Mode d'installation courant (se met à jour quand Chrome propose l'installation). */
export function useInstallMode(): InstallMode {
  const [mode, setMode] = React.useState<InstallMode>("unavailable");
  React.useEffect(() => {
    const update = () => setMode(detectInstallMode());
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return mode;
}
