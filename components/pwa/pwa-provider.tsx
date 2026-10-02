"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { captureInstallPrompt, markInstalled } from "@/lib/pwa/install";

// Enregistre le service worker et garde les vendeurs sur la dernière version du site :
// • vérifie s'il y a une nouvelle version au retour dans l'app (et toutes les heures) ;
// • quand une nouvelle version vient de s'activer, la page suivante est chargée en entier
//   (donc avec le nouveau code), sans jamais recharger sous les doigts du vendeur — un
//   formulaire en cours n'est pas perdu ; un bandeau « Actualiser » est proposé en attendant ;
// • si un fichier de l'ancienne version manque (« ChunkLoadError »), la page se recharge une fois.

const UPDATE_EVERY_MS = 60 * 60 * 1000;
const RELOAD_GUARD_KEY = "jaarle-chunk-reload";

function isChunkError(message: string): boolean {
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(message);
}

function reloadOnceForChunkError() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    if (Date.now() - last < 60_000) return; // déjà tenté il y a moins d'une minute : on évite une boucle
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    /* stockage indisponible : on recharge quand même une fois */
  }
  window.location.reload();
}

export function PwaProvider() {
  const pathname = usePathname();
  const [updateReady, setUpdateReady] = React.useState(false);
  const pathAtUpdate = React.useRef<string | null>(null);

  // Installation : capter l'invitation de Chrome dès le chargement.
  React.useEffect(() => {
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  // Fichiers d'une ancienne version introuvables après un déploiement : recharger.
  React.useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (isChunkError(String(e.message || e.error?.message || ""))) reloadOnceForChunkError();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { name?: string; message?: string } | undefined;
      if (isChunkError(`${r?.name ?? ""} ${r?.message ?? String(e.reason ?? "")}`)) reloadOnceForChunkError();
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // Service worker.
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // En développement, pas de cache : on retire un éventuel ancien service worker.
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => undefined);
      return;
    }

    let registration: ServiceWorkerRegistration | null = null;
    let lastCheck = Date.now();
    const hadController = !!navigator.serviceWorker.controller;

    const checkForUpdate = () => {
      if (!registration || Date.now() - lastCheck < 5 * 60 * 1000) return;
      lastCheck = Date.now();
      registration.update().catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    // Nouvelle version active (pas la toute première installation).
    const onControllerChange = () => {
      if (!hadController) return;
      setUpdateReady(true);
    };

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((reg) => {
          registration = reg;
        })
        .catch(() => undefined);
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      lastCheck = 0;
      checkForUpdate();
    }, UPDATE_EVERY_MS);

    return () => {
      window.removeEventListener("load", register);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  // Une nouvelle version est prête : au prochain changement de page, chargement complet.
  React.useEffect(() => {
    if (!updateReady) return;
    if (pathAtUpdate.current === null) {
      pathAtUpdate.current = pathname;
      return;
    }
    if (pathname !== pathAtUpdate.current) window.location.reload();
  }, [updateReady, pathname]);

  if (!updateReady) return null;
  return (
    <div className="fixed inset-x-3 bottom-24 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-lg md:bottom-5" role="status">
      <RefreshCw className="h-4 w-4 shrink-0 text-primary" />
      <p className="flex-1 text-[13px] leading-snug">Une nouvelle version de Jaarle est disponible.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground"
      >
        Actualiser
      </button>
    </div>
  );
}
