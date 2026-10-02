"use client";

import * as React from "react";
import { removePushSubscription, savePushSubscription } from "@/app/dashboard/settings/push-actions";

// Notifications push côté navigateur : permission, abonnement auprès du service push du
// navigateur, enregistrement chez Jaarle (server actions).

export type PushState = "loading" | "unsupported" | "needs-install" | "denied" | "off" | "on";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const SYNC_KEY = "jaarle-push-synced";

function base64UrlToArrayBuffer(base64Url: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!VAPID_PUBLIC_KEY;
}

function isIosBrowserTab(): boolean {
  if (typeof window === "undefined") return false;
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

/** Le service worker prêt, sans attendre indéfiniment (il n'existe pas en développement). */
async function readyRegistration(timeoutMs = 8000): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (!existing) {
    try {
      await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    } catch {
      return null;
    }
  }
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))]);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

function toPayload(sub: PushSubscription) {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  return { endpoint: json.endpoint ?? sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "", userAgent: navigator.userAgent };
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return isIosBrowserTab() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  return (await currentSubscription()) ? "on" : "off";
}

/** Demande la permission (si besoin), s'abonne et enregistre l'appareil. */
export async function enablePush(): Promise<{ state: PushState; error?: string }> {
  if (!pushSupported()) return { state: isIosBrowserTab() ? "needs-install" : "unsupported" };
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission === "denied") return { state: "denied" };
  if (permission !== "granted") return { state: "off" };

  const reg = await readyRegistration();
  if (!reg) return { state: "off", error: "Recharge la page puis réessaie." };
  try {
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToArrayBuffer(VAPID_PUBLIC_KEY) }));
    const res = await savePushSubscription(toPayload(sub));
    if (!res.ok) return { state: "off", error: res.error };
    try {
      sessionStorage.setItem(SYNC_KEY, "1");
    } catch {
      /* rien */
    }
    return { state: "on" };
  } catch (err) {
    return { state: "off", error: err instanceof Error ? err.message : "Activation impossible." };
  }
}

/** Coupe les notifications sur cet appareil. */
export async function disablePush(): Promise<PushState> {
  const sub = await currentSubscription().catch(() => null);
  if (sub) {
    await removePushSubscription(sub.endpoint).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  return getPushState();
}

/**
 * Réenregistre l'abonnement existant (une fois par session) : après une reconnexion, ou si le
 * navigateur a renouvelé l'abonnement, l'appareil reste relié au compte sans rien redemander.
 */
export async function syncPushSubscription(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  try {
    if (sessionStorage.getItem(SYNC_KEY)) return;
  } catch {
    /* on synchronise quand même */
  }
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return;
  const res = await savePushSubscription(toPayload(sub)).catch(() => null);
  if (res?.ok) {
    try {
      sessionStorage.setItem(SYNC_KEY, "1");
    } catch {
      /* rien */
    }
  }
}

export function usePushState(): [PushState, React.Dispatch<React.SetStateAction<PushState>>] {
  const [state, setState] = React.useState<PushState>("loading");
  React.useEffect(() => {
    let alive = true;
    getPushState()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState("unsupported"));
    return () => {
      alive = false;
    };
  }, []);
  return [state, setState];
}
