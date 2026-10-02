import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { RetryButton } from "./retry-button";

// Affichée par le service worker quand une page ne peut pas être chargée faute de réseau.
// Statique : elle est gardée en cache à l'installation de l'app.

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Pas de connexion",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main id="jaarle-offline" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/icon-192.png" alt="Jaarle" width={64} height={64} className="h-16 w-16" />
      <div className="flex items-center gap-2 text-muted-foreground">
        <WifiOff className="h-5 w-5" />
        <span className="text-sm font-medium">Pas de connexion</span>
      </div>
      <h1 className="max-w-xs text-xl font-bold tracking-tight">Jaarle n&apos;arrive pas à se connecter</h1>
      <p className="max-w-xs text-sm text-muted-foreground">Vérifie ta connexion internet ou tes données mobiles, puis réessaie. Rien n&apos;est perdu.</p>
      <RetryButton />
    </main>
  );
}
