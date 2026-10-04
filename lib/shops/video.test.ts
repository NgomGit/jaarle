import { describe, expect, it } from "vitest";
import { ProductInputSchema } from "@/lib/shops/product-schema";
import {
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  clampRange,
  formatClock,
  formatSeconds,
  initialRange,
  isOwnPosterPath,
  isOwnVideoPath,
  isoDuration,
  moveEnd,
  moveStart,
  needsTrim,
  outputDimensions,
  shiftRange,
} from "@/lib/shops/video";

const len = (r: { start: number; end: number }) => Math.round((r.end - r.start) * 1000) / 1000;

describe("découpage (trim)", () => {
  it("vidéo ≤ 30 s : pas de découpage, tout est gardé", () => {
    expect(needsTrim(12)).toBe(false);
    expect(needsTrim(30)).toBe(false);
    expect(initialRange(12)).toEqual({ start: 0, end: 12 });
  });

  it("vidéo > 30 s : découpage proposé sur les 30 premières secondes", () => {
    expect(needsTrim(72)).toBe(true);
    expect(initialRange(72)).toEqual({ start: 0, end: 30 });
  });

  it("exemple 1 min 12 → 00:18 → 00:48 (exactement 30 s)", () => {
    // En glissant toute la fenêtre…
    const slid = shiftRange(initialRange(72), 18, 72);
    expect(slid).toEqual({ start: 18, end: 48 });
    expect(len(slid)).toBe(MAX_VIDEO_SECONDS);
    // …ou en déplaçant les deux poignées.
    let r = moveStart(initialRange(72), 18, 72);
    expect(r).toEqual({ start: 18, end: 30 });
    r = moveEnd(r, 48, 72);
    expect(r).toEqual({ start: 18, end: 48 });
  });

  it("trim inférieur à 30 s", () => {
    let r = { start: 10, end: 40 };
    r = moveEnd(r, 25, 72);
    expect(r).toEqual({ start: 10, end: 25 });
    expect(len(r)).toBe(15);
  });

  it("la fenêtre ne dépasse jamais 30 s : la poignée opposée suit", () => {
    const r1 = moveEnd({ start: 5, end: 20 }, 60, 72);
    expect(r1).toEqual({ start: 30, end: 60 });
    const r2 = moveStart({ start: 40, end: 60 }, 2, 72);
    expect(r2).toEqual({ start: 2, end: 32 });
  });

  it("au moins 1 s, et toujours dans la vidéo", () => {
    expect(len(moveEnd({ start: 10, end: 20 }, 9, 72))).toBe(1);
    expect(len(moveStart({ start: 10, end: 20 }, 25, 72))).toBe(1);
    expect(moveEnd({ start: 50, end: 72 }, 500, 72).end).toBe(72);
    expect(moveStart({ start: 0, end: 30 }, -5, 72).start).toBe(0);
  });

  it("déplacer toute la fenêtre garde sa durée et reste dans la vidéo", () => {
    expect(shiftRange({ start: 10, end: 40 }, 100, 72)).toEqual({ start: 42, end: 72 });
    expect(shiftRange({ start: 10, end: 40 }, -100, 72)).toEqual({ start: 0, end: 30 });
  });

  it("clampRange corrige une sélection invalide", () => {
    expect(clampRange({ start: 50, end: 10 }, 72)).toEqual({ start: 10, end: 40 });
    expect(clampRange({ start: 0, end: 0.2 }, 0.5)).toEqual({ start: 0, end: 0.5 });
  });
});

describe("affichage", () => {
  it("formate les durées", () => {
    expect(formatClock(18)).toBe("00:18");
    expect(formatClock(72)).toBe("01:12");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatSeconds(30)).toBe("30 s");
    expect(formatSeconds(12.46)).toBe("12,5 s");
    expect(isoDuration(12_500)).toBe("PT12.5S");
  });
});

describe("dimensions de sortie (720p)", () => {
  it("portrait 1080×1920 → 720×1280", () => expect(outputDimensions(1080, 1920)).toEqual({ width: 720, height: 1280 }));
  it("paysage 4K → 1280×720", () => expect(outputDimensions(3840, 2160)).toEqual({ width: 1280, height: 720 }));
  it("jamais d'agrandissement, valeurs paires", () => {
    expect(outputDimensions(640, 360)).toEqual({ width: 640, height: 360 });
    expect(outputDimensions(481, 853)).toEqual({ width: 482, height: 854 });
  });
  it("carré 1080 → 720", () => expect(outputDimensions(1080, 1080)).toEqual({ width: 720, height: 720 }));
});

describe("chemins de stockage (sécurité)", () => {
  const me = "5b2f0c3e-1111-4a5b-9c8d-0123456789ab";
  const other = "9a8b7c6d-2222-4a5b-9c8d-0123456789ab";
  const file = "0f1e2d3c-3333-4a5b-9c8d-0123456789ab";
  it("accepte uniquement {moi}/videos/{uuid}.mp4", () => {
    expect(isOwnVideoPath(me, `${me}/videos/${file}.mp4`)).toBe(true);
    expect(isOwnVideoPath(me, `${other}/videos/${file}.mp4`)).toBe(false);
    expect(isOwnVideoPath(me, `${me}/products/${file}.mp4`)).toBe(false);
    expect(isOwnVideoPath(me, `${me}/videos/${file}.mov`)).toBe(false);
    expect(isOwnVideoPath(me, `${me}/videos/../${other}/videos/${file}.mp4`)).toBe(false);
  });
  it("aperçu : {moi}/videos/{uuid}.webp", () => {
    expect(isOwnPosterPath(me, `${me}/videos/${file}.webp`)).toBe(true);
    expect(isOwnPosterPath(me, `${other}/videos/${file}.webp`)).toBe(false);
  });
});

describe("validation du formulaire produit", () => {
  const base = { name: "Boubou", price: 25000, images: [{ path: "u/products/a.webp" }] };
  const video = { path: "p", posterPath: null, durationMs: 30_000, fileSize: 8_000_000, width: 720, height: 1280 };

  it("produit sans vidéo : inchangé (aucune régression)", () => {
    const r = ProductInputSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.success && r.data.video).toBeUndefined();
  });
  it("vidéo ≤ 30 s acceptée, null = suppression", () => {
    expect(ProductInputSchema.safeParse({ ...base, video }).success).toBe(true);
    const r = ProductInputSchema.safeParse({ ...base, video: null });
    expect(r.success && r.data.video).toBeNull();
  });
  it("vidéo trop longue refusée", () => {
    expect(ProductInputSchema.safeParse({ ...base, video: { ...video, durationMs: 45_000 } }).success).toBe(false);
  });
  it("vidéo trop lourde refusée", () => {
    expect(ProductInputSchema.safeParse({ ...base, video: { ...video, fileSize: MAX_VIDEO_BYTES + 1 } }).success).toBe(false);
  });
  it("toujours 4 photos maximum", () => {
    const images = Array.from({ length: 5 }, (_, i) => ({ path: `u/products/${i}.webp` }));
    expect(ProductInputSchema.safeParse({ ...base, images }).success).toBe(false);
  });
});
