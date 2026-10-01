"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatValue, shortDate, sumOf, type DayPoint, type MetricFormat } from "@/lib/admin/dashboard";

// Graphiques du tableau de bord admin, dessinés en SVG (aucune librairie) :
// une seule couleur de série (le violet Jaarle), grille discrète, infobulle au survol / au toucher.

const SERIES = "hsl(var(--primary))";
const GRID = "hsl(var(--border))";

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = React.useRef<T>(null);
  const [w, setW] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setW(Math.floor(entries[0].contentRect.width)));
    ro.observe(el);
    setW(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Graduations « rondes » de 0 au maximum (4 intervalles). */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/* ── Mini-courbe des cartes chiffres ─────────────────────────────────────── */

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const w = 120, h = 36, pad = 4;
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const x = (i: number) => pad + (i / (values.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const last = values.length - 1;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-9 w-[120px]", className)} aria-hidden>
      <path d={`${d}L${x(last)} ${h - pad}L${x(0)} ${h - pad}Z`} fill={SERIES} fillOpacity={0.1} />
      <path d={d} fill="none" stroke={SERIES} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r={3} fill={SERIES} stroke="hsl(var(--card))" strokeWidth={1.5} />
    </svg>
  );
}

/* ── Courbe principale avec choix de l'indicateur ────────────────────────── */

export interface TrendMetric {
  key: keyof Omit<DayPoint, "date">;
  label: string;
  format?: MetricFormat;
}

export function TrendChart({ series, metrics }: { series: DayPoint[]; metrics: TrendMetric[] }) {
  const [active, setActive] = React.useState(0);
  const [hover, setHover] = React.useState<number | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const metric = metrics[active];
  const values = series.map((d) => Number(d[metric.key]) || 0);
  const ticks = niceTicks(Math.max(...values, 0));
  const top = ticks.at(-1) ?? 1;

  const h = 240, left = 44, right = 12, topPad = 12, bottom = 28;
  const plotW = Math.max(width - left - right, 10);
  const plotH = h - topPad - bottom;
  const n = values.length;
  const x = (i: number) => left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const y = (v: number) => topPad + plotH - (v / top) * plotH;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 72))));

  function pick(clientX: number, target: SVGRectElement) {
    const box = target.getBoundingClientRect();
    const rel = clientX - box.left;
    const i = Math.round((rel / box.width) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  }

  const hv = hover != null ? values[hover] : null;
  const tipLeft = hover != null ? Math.min(Math.max(x(hover), left + 70), width - 80) : 0;

  return (
    <div>
      <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Indicateur affiché">
        {metrics.map((m, i) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => {
              setActive(i);
              setHover(null);
            }}
            className={cn(
              "flex shrink-0 flex-col items-start rounded-xl border px-3.5 py-2 text-left transition-colors",
              i === active ? "border-primary/40 bg-accent text-accent-foreground" : "border-border hover:bg-muted"
            )}
          >
            <span className="text-xs font-medium opacity-80">{m.label}</span>
            <span className="text-base font-bold tabular-nums">{formatValue(sumOf(series, m.key), m.format, true)}</span>
          </button>
        ))}
      </div>

      <div ref={ref} className="relative w-full select-none">
        {width > 0 && (
          <svg width={width} height={h} role="img" aria-label={`${metric.label} par jour`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={left} x2={width - right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={left - 8} y={y(t) + 4} textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                  {formatValue(t, "int", true)}
                </text>
              </g>
            ))}
            {series.map((d, i) =>
              i % labelEvery === 0 || i === n - 1 ? (
                <text key={d.date} x={x(i)} y={h - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-muted-foreground text-[11px]">
                  {shortDate(d.date)}
                </text>
              ) : null
            )}
            <path d={`${line}L${x(n - 1)} ${y(0)}L${x(0)} ${y(0)}Z`} fill={SERIES} fillOpacity={0.1} />
            <path d={line} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {hover != null && hv != null && (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={topPad} y2={topPad + plotH} stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeOpacity={0.5} />
                <circle cx={x(hover)} cy={y(hv)} r={5} fill={SERIES} stroke="hsl(var(--card))" strokeWidth={2} />
              </g>
            )}
            <rect
              x={left}
              y={topPad}
              width={plotW}
              height={plotH}
              fill="transparent"
              onMouseMove={(e) => pick(e.clientX, e.currentTarget)}
              onMouseLeave={() => setHover(null)}
              onTouchStart={(e) => pick(e.touches[0].clientX, e.currentTarget)}
              onTouchMove={(e) => pick(e.touches[0].clientX, e.currentTarget)}
            />
          </svg>
        )}
        {hover != null && hv != null && (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-border bg-card px-3 py-1.5 text-center shadow-md"
            style={{ left: tipLeft }}
          >
            <p className="text-[11px] text-muted-foreground">{shortDate(series[hover].date)}</p>
            <p className="text-sm font-bold tabular-nums">{formatValue(hv, metric.format)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Barres horizontales (sources, villes) ───────────────────────────────── */

export function BarList({ rows, format = "int", empty = "Aucune donnée sur la période." }: {
  rows: { label: string; value: number; hint?: string }[];
  format?: MetricFormat;
  empty?: string;
}) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((n, r) => n + r.value, 0);
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label} : ${formatValue(r.value, format)}${total ? ` (${Math.round((r.value / total) * 100)} %)` : ""}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {formatValue(r.value, format)}
              {total > 0 && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{Math.round((r.value / total) * 100)} %</span>}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max((r.value / max) * 100, 2)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── Entonnoir des vendeurs ──────────────────────────────────────────────── */

export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const first = Math.max(steps[0]?.value ?? 0, 1);
  return (
    <ol className="flex flex-col gap-2.5">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const keep = prev ? Math.round((s.value / prev) * 100) : null;
        const pct = (s.value / first) * 100;
        return (
          <li key={s.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                <span className="mr-1.5 text-xs font-semibold text-muted-foreground">{i + 1}.</span>
                {s.label}
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="font-bold">{formatValue(s.value)}</span>
                {keep != null && <span className="ml-1.5 text-xs text-muted-foreground">{keep} % de l&apos;étape précédente</span>}
              </span>
            </div>
            <div className="h-7 w-full rounded-lg bg-muted">
              <div
                className="flex h-7 items-center rounded-lg bg-primary px-2 text-xs font-semibold text-primary-foreground"
                style={{ width: `${Math.max(pct, s.value > 0 ? 3 : 0)}%` }}
              >
                {pct >= 14 ? `${Math.round(pct)} %` : ""}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
