import Link from "next/link";
import { cn } from "@/lib/utils";

// Listes de relance (pastilles) et filtre « pas encore relancées / toutes ».

export const RELANCES_PATH = "/dashboard/admin/relances";

export type RelanceReason = "draft_with_products" | "no_products" | "no_shop";

export const SEGMENTS = [
  { key: "produits", label: "Produits, pas en ligne", reason: "draft_with_products" },
  { key: "sans-produit", label: "Sans produit", reason: "no_products" },
  { key: "sans-boutique", label: "Compte sans boutique", reason: "no_shop" },
] as const satisfies readonly { key: string; label: string; reason: RelanceReason }[];

export const FILTERS = [
  { key: "a-relancer", label: "Pas encore relancées" },
  { key: "toutes", label: "Toutes" },
] as const;

export type SegmentKey = (typeof SEGMENTS)[number]["key"];
export type FilterKey = (typeof FILTERS)[number]["key"];

/** Onglets « Pas encore relancées / Toutes » (conservent la liste choisie). */
export function FilterTabs({ segment, filter }: { segment: SegmentKey; filter: FilterKey }) {
  return (
    <nav className="inline-flex rounded-xl border border-border bg-muted p-1" aria-label="Filtre">
      {FILTERS.map((f) => (
        <Link
          key={f.key}
          href={`${RELANCES_PATH}?type=${segment}&filtre=${f.key}`}
          aria-current={f.key === filter ? "page" : undefined}
          className={cn("rounded-lg px-3.5 py-1.5 text-sm font-medium", f.key === filter ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {f.label}
        </Link>
      ))}
    </nav>
  );
}

/** Pastilles des listes de relance. */
export function SegmentPills({ segment, filter }: { segment: SegmentKey; filter: FilterKey }) {
  return (
    <nav className="mb-5 flex flex-wrap gap-2" aria-label="Type de relance">
      {SEGMENTS.map((sg) => (
        <Link
          key={sg.key}
          href={`${RELANCES_PATH}?type=${sg.key}&filtre=${filter}`}
          aria-current={sg.key === segment ? "page" : undefined}
          className={cn(
            "rounded-full border px-4 py-1.5 text-sm font-medium",
            sg.key === segment ? "border-primary bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:text-foreground"
          )}
        >
          {sg.label}
        </Link>
      ))}
    </nav>
  );
}
