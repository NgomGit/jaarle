import { describe, expect, it } from "vitest";
import { aggregateByUser, isStuckBalance, packYield, periodTotals, type LedgerRow, type UsageRow } from "@/lib/admin/credits";

const row = (p: Partial<LedgerRow>): LedgerRow => ({
  id: Math.random().toString(36),
  user_id: "u1",
  delta: 0,
  kind: "purchase",
  usage_event_id: null,
  order_id: null,
  note: null,
  created_at: "2026-10-07T10:00:00Z",
  ...p,
});

describe("packYield", () => {
  it("pack de 5 crédits à 2 crédits l'affiche = 2 affiches + 1 crédit orphelin", () => {
    expect(packYield(5, 2)).toEqual({ posters: 2, leftover: 1 });
    expect(packYield(15, 2)).toEqual({ posters: 7, leftover: 1 });
    expect(packYield(30, 2)).toEqual({ posters: 15, leftover: 0 });
  });
});

describe("aggregateByUser", () => {
  it("reproduit le cas client : 5 achetés, 2 affiches, 1 restant bloqué", () => {
    const events = new Map<string, UsageRow>([
      ["e1", { id: "e1", action: "poster_generate", units: 2, creation_id: "c1", refund_of: null }],
      ["e2", { id: "e2", action: "poster_generate", units: 2, creation_id: "c2", refund_of: null }],
    ]);
    const ledger = [
      row({ delta: 5, kind: "purchase", created_at: "2026-10-07T09:00:00Z" }),
      row({ delta: -2, kind: "generation", usage_event_id: "e1" }),
      row({ delta: -2, kind: "generation", usage_event_id: "e2", created_at: "2026-10-07T11:00:00Z" }),
    ];
    const [u] = aggregateByUser(ledger, events);
    expect(u).toMatchObject({ bought: 5, used: 4, balance: 1, postersViaCredits: 2, lastAt: "2026-10-07T11:00:00Z" });
    expect(isStuckBalance(u.balance, 2)).toBe(true);
  });

  it("une génération remboursée ne compte pas comme affiche", () => {
    const events = new Map<string, UsageRow>([
      ["e1", { id: "e1", action: "poster_generate", units: 2, creation_id: "c1", refund_of: null }],
      ["r1", { id: "r1", action: "poster_generate", units: -2, creation_id: "c1", refund_of: "e1" }],
    ]);
    const ledger = [
      row({ delta: 5, kind: "purchase" }),
      row({ delta: -2, kind: "generation", usage_event_id: "e1" }),
      row({ delta: 2, kind: "refund", usage_event_id: "r1" }),
      row({ delta: -1, kind: "admin" }),
      row({ delta: 3, kind: "admin" }),
    ];
    const [u] = aggregateByUser(ledger, events);
    expect(u).toMatchObject({ bought: 5, used: 2, refunded: 2, removed: 1, offered: 3, balance: 7, postersViaCredits: 0 });
  });
});

describe("periodTotals", () => {
  it("filtre par date et compte les acheteurs", () => {
    const ledger = [
      row({ delta: 5, kind: "purchase", created_at: "2026-09-01T00:00:00Z" }),
      row({ delta: 15, kind: "purchase", user_id: "u2", created_at: "2026-10-05T00:00:00Z" }),
      row({ delta: -2, kind: "generation", user_id: "u2", created_at: "2026-10-06T00:00:00Z" }),
    ];
    expect(periodTotals(ledger, "2026-10-01T00:00:00Z")).toMatchObject({ bought: 15, used: 2, buyers: 1 });
    expect(periodTotals(ledger, null)).toMatchObject({ bought: 20, buyers: 2 });
  });
});
