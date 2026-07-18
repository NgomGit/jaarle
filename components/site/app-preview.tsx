"use client";

import * as React from "react";
import {
  UploadCloud, Pencil, ImagePlus, Sparkles, CheckCircle2,
  Circle, Download, Share2, Tag, DollarSign,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";
import { creationStyles as styles } from "@/lib/creation-styles";
import { cn } from "@/lib/utils";

export function AppPreview() {
  const { t } = useLocale();
  const [selectedStyle, setSelectedStyle] = React.useState("premium");

  return (
    <section id="preview" className="pb-24">
      <div className="container">
        <div className="mx-auto mb-12 max-w-xl text-center">
          <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">{t("preview.title")}</h2>
          <p className="text-muted-foreground">{t("preview.desc")}</p>
        </div>

        <Tabs defaultValue="import" className="grid grid-cols-1 gap-8 rounded-[28px] border border-border bg-card p-6 shadow-glow-md md:grid-cols-[0.85fr_1.15fr] md:p-9">
          <TabsList>
            <TabsTrigger value="import">
              <TabIcon icon={UploadCloud} />
              <TabLabel title={t("preview.tab1")} sub={t("preview.tab1s")} />
            </TabsTrigger>
            <TabsTrigger value="style">
              <TabIcon icon={ImagePlus} />
              <TabLabel title={t("preview.tab2")} sub={t("preview.tab2s")} />
            </TabsTrigger>
            <TabsTrigger value="generation">
              <TabIcon icon={Sparkles} />
              <TabLabel title={t("preview.tab3")} sub={t("preview.tab3s")} />
            </TabsTrigger>
            <TabsTrigger value="result">
              <TabIcon icon={CheckCircle2} />
              <TabLabel title={t("preview.tab4")} sub={t("preview.tab4s")} />
            </TabsTrigger>
          </TabsList>

          <div className="min-h-[400px] rounded-[20px] border border-border bg-muted p-5">
            <TabsContent value="import">
              <div className="mb-3.5 rounded-2xl border border-dashed border-input bg-card p-9 text-center">
                <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white">
                  <UploadCloud className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <p className="mb-1 text-sm font-semibold">{t("preview.uploadTitle")}</p>
                <span className="text-xs text-muted-foreground">{t("preview.uploadHint")}</span>
              </div>
              <Field icon={Tag} label={t("preview.fieldProduct")} value="Robe wax bleue" />
              <Field icon={DollarSign} label={t("preview.fieldPrice")} value="25 000 FCFA" mono />
            </TabsContent>

            <TabsContent value="style">
              <div className="grid grid-cols-3 gap-2.5">
                {styles.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSelectedStyle(s.key)}
                    className={cn(
                      "relative aspect-[3/4] overflow-hidden rounded-xl border-2 bg-gradient-to-br transition-all",
                      s.from, s.to,
                      selectedStyle === s.key ? "border-primary" : "border-transparent"
                    )}
                  >
                    <span className="absolute bottom-2 left-2 right-2 text-left text-[10px] font-bold capitalize text-white">
                      {s.key}
                    </span>
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="generation">
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary">
                    <span className="absolute inset-[-4px] animate-ping rounded-xl border border-primary/50" />
                  </div>
                  <div>
                    <div className="text-sm font-bold">{t("preview.aiTitle")}</div>
                    <div className="text-xs text-muted-foreground">{t("preview.aiSub")}</div>
                  </div>
                </div>
                {[t("preview.step1"), t("preview.step2"), t("preview.step3"), t("preview.step4"), t("preview.step5")].map((step, i) => (
                  <div key={step} className={cn("flex items-center gap-3 border-t border-border py-2.5 text-sm first:border-t-0", i < 2 ? "text-foreground" : i === 2 ? "font-semibold text-foreground" : "text-muted-foreground")}>
                    {i < 2 ? <CheckCircle2 className="h-[18px] w-[18px] text-success" /> : <Circle className={cn("h-[18px] w-[18px]", i === 2 && "text-primary")} strokeWidth={1.75} />}
                    {step}
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="result">
              <div className="mb-3.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3.5 py-1.5 font-mono text-xs font-bold text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Score 91/100
                </div>
                <span className="text-xs text-muted-foreground">{t("preview.resultCount")}</span>
              </div>
              <div className="mb-3.5 grid grid-cols-4 gap-2">
                {styles.slice(0, 4).map((s) => (
                  <div key={s.key} className={cn("aspect-square rounded-xl bg-gradient-to-br", s.from, s.to)} />
                ))}
              </div>
              <Field icon={Pencil} label={t("preview.resultText")} value="&ldquo;Élégance et fraîcheur — notre robe wax bleue, faite pour te sublimer. Livraison à Dakar.&rdquo;" small />
              <div className="mt-3 flex gap-2.5">
                <Button variant="secondary" className="flex-1 gap-1.5"><Download className="h-3.5 w-3.5" />{t("preview.download")}</Button>
                <Button variant="accent" className="flex-1 gap-1.5"><Share2 className="h-3.5 w-3.5" />{t("preview.share")}</Button>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </section>
  );
}

function TabIcon({ icon: Icon }: { icon: React.ElementType }) {
  return (
    <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-background text-muted-foreground [[data-state=active]_&]:bg-gradient-to-br [[data-state=active]_&]:from-primary [[data-state=active]_&]:to-secondary [[data-state=active]_&]:text-white">
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </div>
  );
}

function TabLabel({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <div className="text-[14.5px] font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function Field({ icon: Icon, label, value, mono, small }: { icon: React.ElementType; label: string; value: string; mono?: boolean; small?: boolean }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3.5">
      <div>
        <div className="mb-0.5 text-[11px] text-muted-foreground">{label}</div>
        <div className={cn(small ? "text-[12.5px] font-normal leading-relaxed" : "text-sm font-semibold", mono && "font-mono")}>{value}</div>
      </div>
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
    </div>
  );
}
