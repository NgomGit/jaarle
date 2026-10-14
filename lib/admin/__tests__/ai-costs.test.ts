import { describe, expect, it } from "vitest";
import { aggregateAiCosts, per30Days, percentile, planAt, shareLevel, shareOfPrice, type AiCallRow, type PlanRow, type SubRow } from "@/lib/admin/ai-costs";

const plans = new Map<string, PlanRow>([
  ["free", { key: "free", name: "Gratuit", price_fcfa: 0, sort: 0 }],
  ["pro", { key: "pro", name: "Pro", price_fcfa: 2500, sort: 10 }],
  ["business", { key: "business", name: "Business", price_fcfa: 5000, sort: 20 }],
]);
const sub = (p: Partial<SubRow>): SubRow => ({ user_id: "u1", plan_key: "pro", status: "active", starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-10-31T00:00:00Z", ...p });
const call = (p: Partial<AiCallRow>): AiCallRow => ({ user_id: "u1", feature: "poster_generate", model: null, est_cost_usd: "0.12", created_at: "2026-10-05T10:00:00Z", ...p });

describe("planAt", () => {
  it("formule active au moment de l'appel, sinon Gratuit", () => {
    const subs = [sub({})];
    expect(planAt(subs, plans, "2026-10-05T10:00:00Z")).toBe("pro");
    expect(planAt(subs, plans, "2026-09-30T10:00:00Z")).toBe("free");
    expect(planAt(subs, plans, "2026-10-31T00:00:00Z")).toBe("free"); // fin exclue
    expect(planAt(undefined, plans, "2026-10-05T10:00:00Z")).toBe("free");
  });
  it("la formule la plus haute l'emporte (Business offert pendant un Pro) ; abonnement arrêté ignoré", () => {
    const subs = [sub({}), sub({ plan_key: "business", starts_at: "2026-10-04T00:00:00Z", ends_at: "2026-10-11T00:00:00Z" })];
    expect(planAt(subs, plans, "2026-10-05T10:00:00Z")).toBe("business");
    expect(planAt(subs, plans, "2026-10-12T10:00:00Z")).toBe("pro");
    expect(planAt([sub({ status: "canceled" })], plans, "2026-10-05T10:00:00Z")).toBe("free");
  });
});

describe("aggregateAiCosts", () => {
  it("rattache chaque appel à la formule du moment et calcule moyenne, médiane, max", () => {
    const subsByUser = new Map([
      ["u1", [sub({})]],
      ["u2", [sub({ user_id: "u2" })]],
      ["u3", [sub({ user_id: "u3", plan_key: "business" })]],
    ]);
    const calls = [
      call({}), // u1 pro 0.12
      call({ est_cost_usd: 0.1, feature: "poster_regenerate" }), // u1 pro
      call({ user_id: "u2", est_cost_usd: "0.02", feature: "product_autofill" }), // u2 pro
      call({ user_id: "u3", est_cost_usd: 1 }), // u3 business
      call({ user_id: "u1", created_at: "2026-09-20T10:00:00Z", est_cost_usd: 0.5 }), // u1 encore Gratuit
      call({ user_id: null, est_cost_usd: 0.3 }), // sans utilisateur
    ];
    const s = aggregateAiCosts(calls, subsByUser, plans);
    expect(s.calls).toBe(6);
    expect(s.totalUsd).toBeCloseTo(2.04);
    expect(s.anonymousUsd).toBeCloseTo(0.3);
    expect(s.usersWithCalls).toBe(3);
    expect(s.byPlan.map((p) => p.plan)).toEqual(["business", "pro", "free"]);
    const pro = s.byPlan.find((p) => p.plan === "pro")!;
    expect(pro.activeUsers).toBe(2);
    expect(pro.totalUsd).toBeCloseTo(0.24);
    expect(pro.avgUsd).toBeCloseTo(0.12);
    expect(pro.maxUsd).toBeCloseTo(0.22);
    expect(pro.medianUsd).toBeCloseTo(0.02);
    // u1 : 0.5 en Gratuit > 0.22 en Pro → formule principale = Gratuit.
    expect(s.byUser[0]).toMatchObject({ userId: "u3", plan: "business" });
    expect(s.byUser.find((u) => u.userId === "u1")).toMatchObject({ plan: "free", calls: 3, topFeature: "poster_generate" });
    expect(s.byFeature[0]).toMatchObject({ feature: "poster_generate", calls: 4 });
  });
});

describe("outils", () => {
  it("percentile, ramené à 30 jours, part du prix, niveau", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(percentile([], 50)).toBe(0);
    expect(per30Days(1, 7)).toBeCloseTo(30 / 7);
    expect(shareOfPrice(5, 5000, 600)).toBeCloseTo(0.6);
    expect(shareOfPrice(5, 0)).toBeNull();
    expect(shareLevel(0.3)).toBe("ok");
    expect(shareLevel(0.6)).toBe("warn");
    expect(shareLevel(1.2)).toBe("loss");
    expect(shareLevel(null)).toBe("none");
  });
});
