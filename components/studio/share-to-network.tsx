"use client";

import * as React from "react";
import { Check, Loader2, Send, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";
import { PLATFORM_BY_KEY, type StudioPlatform } from "@/lib/studio/platforms";
import { cn } from "@/lib/utils";

// Bouton « Publier sur Instagram / Facebook / TikTok / Story / Statut WhatsApp ».
//
// Aucune API des réseaux : on passe par le partage natif du téléphone (Web Share API), qui
// propose les applications installées. Instagram, TikTok et Facebook ignorent le texte d'un
// partage → la légende est copiée juste avant ; il suffit de la coller dans l'application.
// Sur ordinateur (pas d'applications) : le visuel est téléchargé, la légende copiée et le site
// du réseau ouvert dans un nouvel onglet quand il permet de publier.

/** Sites où l'on peut publier depuis un ordinateur (stories et statuts : téléphone seulement). */
const WEB_UPLOAD: Partial<Record<StudioPlatform, string>> = {
  instagram_feed: "https://www.instagram.com/",
  facebook: "https://www.facebook.com/",
  tiktok: "https://www.tiktok.com/upload",
};

/** Nom de l'application à ouvrir dans le partage du téléphone. */
const APP_NAME: Record<StudioPlatform, string> = {
  instagram_feed: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  instagram_story: "Instagram",
  whatsapp_status: "WhatsApp",
};

// Fichiers déjà préparés (une même variante n'est téléchargée qu'une fois par page).
const fileCache = new Map<string, Promise<File>>();
// Les mêmes, une fois arrivés : lus sans « await » pour partager dans le geste de l'utilisateur.
const readyFiles = new Map<string, File>();

function loadFile(url: string, baseName: string): Promise<File> {
  let p = fileCache.get(url);
  if (!p) {
    p = fetch(url, { credentials: "same-origin" }).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const type = blob.type || "image/jpeg";
      const ext = type.includes("png") ? "png" : "jpg";
      const file = new File([blob], `${baseName}.${ext}`, { type });
      readyFiles.set(url, file);
      return file;
    });
    p.catch(() => fileCache.delete(url));
    fileCache.set(url, p);
  }
  return p;
}

/** Téléphone ou tablette capable de partager une image vers une application. */
function detectMobileFileShare(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.canShare) return false;
  const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  if (!touch) return false;
  try {
    return navigator.canShare({ files: [new File([new Blob(["x"], { type: "image/jpeg" })], "test.jpg", { type: "image/jpeg" })] });
  } catch {
    return false;
  }
}

function saveData(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !!c?.saveData;
}

type Phase = "idle" | "preparing" | "ready" | "done" | "desktopDone";

export function ShareToNetwork({
  platform,
  fileUrl,
  fileBaseName,
  caption,
  onCopied,
  className,
}: {
  platform: StudioPlatform;
  /** URL du visuel complet (même fichier que le téléchargement, avec share=1). */
  fileUrl: string;
  fileBaseName: string;
  /** Légende complète (texte + appel à l'action + hashtags) copiée avant le partage. */
  caption: string;
  onCopied?: () => void;
  className?: string;
}) {
  const { t } = useLocale();
  const [mobile, setMobile] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const app = APP_NAME[platform];
  const label = t(`studio.shareOn_${platform}`);

  React.useEffect(() => {
    setMobile(detectMobileFileShare());
  }, []);

  // Le partage doit partir pendant le geste de l'utilisateur (Safari est strict) : sur téléphone,
  // on prépare le fichier dès l'affichage (sauf mode « économie de données »).
  React.useEffect(() => {
    setPhase("idle");
    setError(null);
    if (mobile && !saveData()) void loadFile(fileUrl, fileBaseName).catch(() => undefined);
  }, [mobile, fileUrl, fileBaseName]);

  function copyCaption() {
    if (!caption) return;
    // Pas d'await : l'appel doit rester dans le geste, avant navigator.share.
    navigator.clipboard?.writeText(caption).then(onCopied, () => undefined);
  }

  async function shareFile(file: File) {
    // WhatsApp garde le texte joint à l'image ; les autres applications l'ignorent (légende copiée).
    const data: ShareData = platform === "whatsapp_status" && caption ? { files: [file], text: caption } : { files: [file] };
    await navigator.share(data);
  }

  async function onMobile() {
    copyCaption();
    setError(null);
    // Fichier déjà prêt → partage immédiat, sans attente, dans le geste.
    let file: File | null = readyFiles.get(fileUrl) ?? null;
    try {
      if (!file) {
        setPhase("preparing");
        file = await loadFile(fileUrl, fileBaseName);
      }
      await shareFile(file);
      setPhase("done");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "AbortError") {
        setPhase("idle"); // partage annulé
      } else if (name === "NotAllowedError" && file) {
        setPhase("ready"); // le geste a expiré pendant la préparation : un 2e toucher suffit
      } else {
        setPhase("idle");
        setError(t("studio.shareError"));
      }
    }
  }

  function onDesktop() {
    copyCaption();
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = fileBaseName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    const site = WEB_UPLOAD[platform];
    if (site) window.open(site, "_blank", "noopener,noreferrer");
    setPhase("desktopDone");
  }

  const busy = phase === "preparing";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Button variant="accent" size="lg" className="w-full" onClick={mobile ? onMobile : onDesktop} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : phase === "done" ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        {busy ? t("studio.sharePreparing") : phase === "ready" ? t("studio.shareTapAgain") : label}
      </Button>

      {phase === "done" && <p className="rounded-xl bg-success/10 px-3 py-2 text-center text-xs text-success">{t("studio.shareDone").replace("{app}", app)}</p>}
      {phase === "desktopDone" && (
        <p className="rounded-xl bg-accent px-3 py-2 text-xs text-accent-foreground">
          {t(WEB_UPLOAD[platform] ? "studio.shareDesktopDone" : "studio.shareDesktopPhoneOnly").replace(/\{app\}/g, app)}
        </p>
      )}
      {phase === "idle" && !mobile && !WEB_UPLOAD[platform] && (
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("studio.sharePhoneHint").replace("{app}", app)}
        </p>
      )}
      {error && <p className="text-center text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function shareFileBaseName(productName: string, platform: StudioPlatform): string {
  const slug =
    productName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "visuel";
  return `${slug}-${PLATFORM_BY_KEY[platform].shortLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
