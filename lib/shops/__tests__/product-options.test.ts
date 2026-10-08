import { describe, expect, it } from "vitest";
import { optionValuesError, parseOptionValues } from "@/lib/shops/product-options";

describe("parseOptionValues", () => {
  it("virgules et autres séparateurs", () => {
    expect(parseOptionValues("M, L ,XL")).toEqual(["M", "L", "XL"]);
    expect(parseOptionValues("Rouge; Bleu / Noir")).toEqual(["Rouge", "Bleu", "Noir"]);
  });
  it("tailles séparées par des espaces (cas du client)", () => {
    expect(parseOptionValues("M L xl xxl")).toEqual(["M", "L", "xl", "xxl"]);
    expect(parseOptionValues("38 39 40 41")).toEqual(["38", "39", "40", "41"]);
  });
  it("un nom composé reste un seul choix", () => {
    expect(parseOptionValues("Rose poudré")).toEqual(["Rose poudré"]);
    expect(parseOptionValues("Rose poudré, Vert ciment")).toEqual(["Rose poudré", "Vert ciment"]);
  });
  it("retire les doublons et les vides", () => {
    expect(parseOptionValues("M, m, , L")).toEqual(["M", "L"]);
  });
});

describe("optionValuesError", () => {
  it("couleurs sans virgules = choix trop long, message clair", () => {
    const values = parseOptionValues("Vert ciment rose poudré noir blanc");
    expect(optionValuesError("Couleur", values)).toMatch(/^Couleur : .*trop long.*virgules/);
  });
  it("valide", () => {
    expect(optionValuesError("Taille", ["M", "L"])).toBeNull();
  });
});
