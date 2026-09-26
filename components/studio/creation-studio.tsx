"use client";

import * as React from "react";
import { Megaphone, Sparkles } from "lucide-react";
import { setPackVersion } from "@/app/dashboard/studio/actions";
import { Button } from "@/components/ui/button";
import type { MockShop } from "@/components/studio/mockups";
import { StudioEditor } from "@/components/studio/studio-workspace";
import { useLocale } from "@/lib/locale-context";
import type { MarketingPack } from "@/lib/studio/types";

/**
 * Studio sur la page d'une affiche : « Publier sur mes réseaux ». La version publiée est celle
 * affichée dans le carrousel de l'affiche (`versionId`, contrôlé par la page).
 * Ouvert à tous, dans la limite des générations du mois. Tant que l'affiche n'est pas payée, les
 * visuels téléchargés portent le logo Jaarle en signature (façon CapCut).
 */
export function CreationStudio({
  creationId,
  versionId,
  initialPack,
  locked,
  shop,
}: {
  creationId: string;
  versionId: string | null;
  initialPack: MarketingPack | null;
  locked: boolean;
  shop: MockShop;
}) {
  const { t } = useLocale();
  const [pack, setPack] = React.useState<MarketingPack | null>(initialPack);
  const [formOpen, setFormOpen] = React.useState(!initialPack);
  const [stamp, setStamp] = React.useState(0);

  // La version affichée dans le carrousel change → on l'enregistre sur le pack et on recharge
  // les aperçus (sans relancer l'IA : les textes ne dépendent pas de la version).
  const lastVersion = React.useRef(versionId);
  React.useEffect(() => {
    if (versionId === lastVersion.current) return;
    lastVersion.current = versionId;
    if (!pack) return;
    void setPackVersion(pack.id, versionId).then(() => setStamp((s) => s + 1));
  }, [versionId, pack]);

  // Signature Jaarle tant que l'affiche n'est pas payée : la débloquer (bloc en haut de la page :
  // paiement à l'unité, crédits ou abonnement) la retire.
  const signed = locked;
  const scrollToUnlock = locked ? () => window.scrollTo({ top: 0, behavior: "smooth" }) : undefined;

  return (
    <section id="reseaux" className="scroll-mt-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Megaphone className="h-5 w-5 text-primary" />
            {t("studio.posterSectionTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("studio.posterSectionDesc")}</p>
        </div>
        {pack && !formOpen && (
          <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setFormOpen(true)}>
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("studio.newContent")}</span>
          </Button>
        )}
      </div>

      <p className="mb-4 rounded-xl bg-muted px-3.5 py-2.5 text-xs text-muted-foreground">{t("studio.versionHint")}</p>
      <StudioEditor
        source={{ creationId, versionId }}
        shop={shop}
        initialPack={initialPack}
        formOpen={formOpen}
        onFormOpenChange={setFormOpen}
        onPackChange={setPack}
        locked={locked}
        signed={signed}
        onUnlock={scrollToUnlock}
        unlockLabel={scrollToUnlock ? t("studio.unlockPosterToRemove") : undefined}
        previewStamp={`-${versionId ?? ""}-${stamp}`}
        formTitle={t("studio.posterFormTitle")}
      />
    </section>
  );
}
