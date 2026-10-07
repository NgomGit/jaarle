import { afterEach, describe, expect, it } from "vitest";
import { isPosterV2User } from "@/lib/poster-v2/flags";

describe("testeurs V2", () => {
  afterEach(() => {
    delete process.env.POSTER_V2_TESTERS;
  });
  it("compte de test par défaut (téléphone), administrateurs non inclus", () => {
    expect(isPosterV2User({ id: "u1", phone: "221776524579" })).toBe(true);
    expect(isPosterV2User({ id: "u1" }, { isAdmin: true })).toBe(false);
  });
  it("liste : identifiant, e-mail ou téléphone (formats sénégalais équivalents)", () => {
    process.env.POSTER_V2_TESTERS = "abc-123, a@b.sn, 77 123 45 67";
    expect(isPosterV2User({ id: "ABC-123" })).toBe(true);
    expect(isPosterV2User({ id: "x", email: "A@B.sn" })).toBe(true);
    expect(isPosterV2User({ id: "x", phone: "221771234567" })).toBe(true);
    expect(isPosterV2User({ id: "x", phone: "221781234567" })).toBe(false);
  });
  it("personne par défaut", () => {
    expect(isPosterV2User({ id: "x", phone: "221771234567" })).toBe(false);
    expect(isPosterV2User(null)).toBe(false);
  });
});
