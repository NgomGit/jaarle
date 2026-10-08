import { describe, expect, it } from "vitest";
import { searchGroups, searchKey } from "@/lib/market/search";

describe("searchGroups", () => {
  it("accents, pluriels, petits mots", () => {
    expect(searchGroups("Robes brodées pour la Tabaski")).toEqual(["robe", "brodee", "tabaski"]);
  });
  it("synonymes", () => {
    expect(searchGroups("tenue en basin")).toEqual(["tenue|ensemble|complet", "basin|bazin|getzner"]);
    expect(searchGroups("tiouraye")[0]).toContain("thiouraye");
    expect(searchGroups("Chaussures homme")).toEqual(["chaussure|soulier", "homme"]);
    expect(searchGroups("make-up")).toEqual(["make", "up"]);
  });
  it("doublons et limite de 8 mots", () => {
    expect(searchGroups("robe robe ROBES")).toEqual(["robe"]);
    expect(searchGroups("a1 b2 c3 d4 e5 f6 g7 h8 i9 j10")).toHaveLength(8);
  });
  it("tailles de 2 lettres gardées", () => {
    expect(searchGroups("jean xl")).toEqual(["jean", "xl"]);
  });
});

describe("searchKey", () => {
  it("regroupe les variantes d'écriture", () => {
    expect(searchKey("Robes Brodées")).toBe(searchKey("robe brodee"));
  });
});
