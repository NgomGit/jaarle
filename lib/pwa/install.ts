"use client";

// Petit magasin partagé pour l'installation de la PWA. L'événement « beforeinstallprompt »
// (Android / Chrome ordinateur) arrive très tôt, souvent avant que le tableau de bord soit
// affiché : PwaProvider (layout racine) le capte et le garde ici pour les boutons d'installation.

import * as React from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallMode = "prompt" | "ios" | "in-app-browser" | "installed" | "unavailable";

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

function detectMode(): InstallMode {
  if (typeof window === "undefined") return "unavailable";
  if (installed || isStandalone()) return "installed";
  if (deferred) return "prompt";
  const ua = navigator.userAgent;
  // Navigateurs intégrés (Facebook, Instagram, TikTok…) : impossible d'installer depuis là.
  if (/FBAN|FBAV|FB_IAB|Instagram|musical_ly|Bytedance|Snapchat|Line\//i.test(ua)) return "in-app-browser";
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS/i.test(ua) ? "in-app-browser" : "ios";
  return "unavailable";
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
    const update = () => setMode(detectMode());
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return mode;
}
