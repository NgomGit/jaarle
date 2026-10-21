import { describe, expect, it } from "vitest";
import { senegalE164, vcard, vcardEscape } from "../contact";

describe("vcard", () => {
  it("échappe les caractères spéciaux", () => {
    expect(vcardEscape("A;B,C\\D\nE")).toBe("A\\;B\\,C\\\\D\\nE");
  });
  it("produit une fiche lisible", () => {
    const v = vcard({ name: "Kok; Mode", phone: "+221 77 652 45 79", org: "Kok" });
    expect(v.split("\r\n")).toEqual(["BEGIN:VCARD", "VERSION:3.0", "FN:Kok\\; Mode", "N:Kok\\; Mode;;;;", "TEL;TYPE=CELL:+221776524579", "ORG:Kok", "END:VCARD"]);
  });
});

describe("senegalE164", () => {
  it("normalise les formats courants", () => {
    expect(senegalE164("77 652 45 79")).toBe("+221776524579");
    expect(senegalE164("+221776524579")).toBe("+221776524579");
    expect(senegalE164("221776524579")).toBe("+221776524579");
    expect(senegalE164("")).toBeNull();
  });
});
