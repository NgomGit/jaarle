import { describe, expect, it } from "vitest";
import {
  checkImportInvariants,
  creatableGroups,
  emptyDraft,
  groupState,
  importSummary,
  markReviewed,
  mergeGroups,
  moveItem,
  newGroup,
  normalizeImportState,
  productPhotoIds,
  setExcluded,
  setMain,
  stateFromGrouping,
  unmergeGroup,
  suggestKeyOf,
  unusedItemPaths,
  updateDraft,
  ImportStateSchema,
  type ImportState,
} from "@/lib/products/bulk-import";
import { ProductInputSchema } from "@/lib/shops/product-schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const item = (n: number, videoRef: string | null = null) => ({ id: id(n), path: `u/products/${n}.webp`, width: 100, height: 100, videoRef, name: null });
const G1 = id(101);
const G2 = id(102);
const G3 = id(103);

function base(): ImportState {
  return {
    items: [item(1), item(2), item(3), item(4), item(5, "clip.mp4")],
    groups: [newGroup(G1, [id(1), id(2)]), newGroup(G2, [id(3)])],
    unsorted: [id(4)],
    removed: [],
    variants: [],
  };
  // id(5) volontairement oublié : normalize doit le remettre dans les non rangés
}

describe("normalizeImportState", () => {
  it("ne perd aucun média et respecte les invariants", () => {
    const s = normalizeImportState(base());
    expect(s.unsorted).toEqual([id(4), id(5)]);
    expect(checkImportInvariants(s)).toEqual([]);
  });

  it("garde un média en double au 1er endroit et retire les médias inconnus", () => {
    const s = base();
    s.unsorted = [id(4), id(1), id(999)];
    const n = normalizeImportState(s);
    expect(n.groups[0].itemIds).toEqual([id(1), id(2)]);
    expect(n.unsorted).toEqual([id(4), id(5)]);
    expect(checkImportInvariants(n)).toEqual([]);
  });

  it("supprime les groupes vides non créés et répare la principale", () => {
    const s = base();
    s.groups[1] = { ...s.groups[1], itemIds: [] };
    s.groups[0] = { ...s.groups[0], mainId: id(3) };
    const n = normalizeImportState(s);
    expect(n.groups.map((g) => g.id)).toEqual([G1]);
    expect(n.groups[0].mainId).toBe(id(1));
  });

  it("un groupe déjà créé garde ses médias, même s'ils sont cités ailleurs", () => {
    const s = base();
    s.groups[1] = { ...s.groups[1], productId: id(500) };
    s.groups[0] = { ...s.groups[0], itemIds: [id(1), id(2), id(3)] };
    const n = normalizeImportState(s);
    expect(n.groups.find((g) => g.id === G2)?.itemIds).toEqual([id(3)]);
    expect(n.groups.find((g) => g.id === G1)?.itemIds).toEqual([id(1), id(2)]);
    expect(n.groups.map((g) => g.id)).toEqual([G1, G2]); // ordre d'affichage conservé
  });
});

describe("opérations de révision", () => {
  const s0 = normalizeImportState(base());

  it("déplace vers un groupe, un nouveau groupe, les non rangés, les retirés", () => {
    let s = moveItem(s0, id(4), { kind: "group", groupId: G2 });
    expect(s.groups[1].itemIds).toEqual([id(3), id(4)]);
    s = moveItem(s, id(2), { kind: "new", groupId: G3 });
    expect(s.groups.map((g) => g.id)).toEqual([G1, G2, G3]);
    expect(s.groups[2].itemIds).toEqual([id(2)]);
    s = moveItem(s, id(3), { kind: "removed" });
    expect(s.removed).toEqual([id(3)]);
    s = moveItem(s, id(1), { kind: "unsorted" });
    // G1 vide → supprimé
    expect(s.groups.map((g) => g.id)).toEqual([G2, G3]);
    expect(checkImportInvariants(s)).toEqual([]);
  });

  it("refuse de toucher un produit déjà créé", () => {
    const created = { ...s0, groups: s0.groups.map((g) => (g.id === G1 ? { ...g, productId: id(500) } : g)) };
    expect(moveItem(created, id(1), { kind: "unsorted" })).toBe(created);
    expect(moveItem(created, id(4), { kind: "group", groupId: G1 })).toBe(created);
  });

  it("met une photo en principale seulement si elle est dans le groupe", () => {
    expect(setMain(s0, G1, id(2)).groups[0].mainId).toBe(id(2));
    expect(setMain(s0, G1, id(3)).groups[0].mainId).toBe(id(1));
  });

  it("fusionne deux groupes, avec option de variante", () => {
    let s = updateDraft(s0, G2, { name: "Robe bleue" });
    s = { ...s, variants: [{ groupIds: [G1, G2], option: "Couleur", values: ["Rouge", "Bleu"], reason: "" }] };
    const m = mergeGroups(s, G1, G2, { name: "Couleur", values: ["Rouge", "Bleu", "Rouge"] });
    expect(m.groups.map((g) => g.id)).toEqual([G1]);
    expect(m.groups[0].itemIds).toEqual([id(1), id(2), id(3)]);
    expect(m.groups[0].draft.options).toEqual([{ name: "Couleur", values: ["Rouge", "Bleu"] }]);
    expect(m.groups[0].draft.name).toBe("Robe bleue"); // nom repris si le groupe cible n'en avait pas
    expect(m.variants).toEqual([]);
    expect(checkImportInvariants(m)).toEqual([]);
  });

  it("états : à compléter → prêt → exclu ; vérification", () => {
    let s = s0;
    expect(groupState(s.groups[0])).toBe("incomplete");
    s = updateDraft(s, G1, { name: "Sac" }); // sans prix = « sur demande », pas bloquant
    expect(groupState(s.groups[0])).toBe("ready");
    s = { ...s, groups: s.groups.map((g) => (g.id === G1 ? { ...g, reasons: ["confiance faible"] } : g)) };
    expect(groupState(s.groups[0])).toBe("review");
    expect(creatableGroups(s).map((g) => g.id)).toEqual([G1]);
    s = markReviewed(s, G1);
    expect(groupState(s.groups[0])).toBe("ready");
    s = setExcluded(s, G1, true);
    expect(creatableGroups(s)).toEqual([]);
    expect(importSummary(s)).toMatchObject({ excluded: 1, ready: 0, products: 1 });
  });
});

describe("fusion multiple et défusion", () => {
  const G4 = id(104);
  function abc(): ImportState {
    return normalizeImportState({
      items: [item(1), item(2), item(3), item(4)],
      groups: [newGroup(G1, [id(1)]), newGroup(G2, [id(2)]), newGroup(G3, [id(3), id(4)])],
      unsorted: [],
      removed: [],
      variants: [],
    });
  }

  it("fusionner b et c dans a : b et c disparaissent de la liste", () => {
    let s = updateDraft(abc(), G2, { name: "Pagne bleu", price: 5000 });
    s = [G2, G3].reduce((acc, from) => mergeGroups(acc, G1, from), s);
    expect(s.groups.map((g) => g.id)).toEqual([G1]);
    expect(s.groups[0].itemIds).toEqual([id(1), id(2), id(3), id(4)]);
    expect(s.groups[0].merged.map((m) => m.id)).toEqual([G2, G3]);
    expect(checkImportInvariants(s)).toEqual([]);
    expect(ImportStateSchema.safeParse(s).success).toBe(true);
  });

  it("désélectionner b le recrée avec sa fiche et ses photos, juste après a", () => {
    let s = updateDraft(abc(), G2, { name: "Pagne bleu", price: 5000 });
    s = [G2, G3].reduce((acc, from) => mergeGroups(acc, G1, from), s);
    s = unmergeGroup(s, G1, G2);
    expect(s.groups.map((g) => g.id)).toEqual([G1, G2]);
    expect(s.groups[0].itemIds).toEqual([id(1), id(3), id(4)]);
    expect(s.groups[0].merged.map((m) => m.id)).toEqual([G3]);
    expect(s.groups[1]).toMatchObject({ itemIds: [id(2)], mainId: id(2), draft: { name: "Pagne bleu", price: 5000 }, merged: [] });
    expect(checkImportInvariants(s)).toEqual([]);
  });

  it("une photo déplacée ailleurs entre-temps ne revient pas avec le produit recréé", () => {
    let s = mergeGroups(abc(), G1, G3);
    s = moveItem(s, id(4), { kind: "new", groupId: G4 });
    s = unmergeGroup(s, G1, G3);
    expect(s.groups.find((g) => g.id === G3)?.itemIds).toEqual([id(3)]);
    expect(s.groups.find((g) => g.id === G4)?.itemIds).toEqual([id(4)]);
    expect(checkImportInvariants(s)).toEqual([]);
  });

  it("fusionner un produit qui en contenait d'autres garde toute la chaîne restaurable", () => {
    let s = mergeGroups(abc(), G2, G3);
    s = mergeGroups(s, G1, G2);
    expect(s.groups[0].merged.map((m) => m.id)).toEqual([G3, G2]);
    s = unmergeGroup(s, G1, G3);
    expect(s.groups.map((g) => g.id)).toEqual([G1, G3]);
    expect(s.groups[1].itemIds).toEqual([id(3), id(4)]);
  });
});

describe("photos d'un produit", () => {
  it("principale d'abord, vraies photos avant les images de vidéo, 4 max", () => {
    const items = [item(1, "v"), item(2), item(3), item(4), item(5), item(6)];
    const g = { itemIds: items.map((i) => i.id), mainId: id(3) };
    expect(productPhotoIds({ items }, g)).toEqual([id(3), id(2), id(4), id(5)]);
    expect(suggestKeyOf({ items }, g)).toBe([id(3), id(2), id(4)].join(","));
  });

  it("médias à effacer = ceux qui ne servent à aucun produit", () => {
    const s = normalizeImportState(base());
    expect(unusedItemPaths(s, new Set(["u/products/1.webp", "u/products/2.webp"]))).toEqual([
      "u/products/3.webp",
      "u/products/4.webp",
      "u/products/5.webp",
    ]);
  });
});

describe("stateFromGrouping", () => {
  it("convertit la sortie IA normalisée (indices) en groupes avec ids", () => {
    const items = [item(1), item(2), item(3), item(4)];
    let n = 200;
    const s = stateFromGrouping(
      items,
      {
        groups: [
          { key: "G1", items: [0, 2], main: 2, confidence: "high", label: "Robe wax", reviewReasons: [] },
          { key: "G2", items: [1], main: 1, confidence: "low", label: "Sac", reviewReasons: ["confiance faible"] },
        ],
        unsorted: [{ item: 3 }],
        variants: [{ groups: ["G1", "G2"], option: "Couleur", values: ["Rouge", "Bleu"], reason: "" }],
      },
      () => id(n++)
    );
    expect(s.groups[0]).toMatchObject({ id: id(200), itemIds: [id(1), id(3)], mainId: id(3), suggestion: "pending", label: "Robe wax" });
    expect(s.groups[1].reasons).toEqual(["confiance faible"]);
    expect(s.unsorted).toEqual([id(4)]);
    expect(s.variants[0].groupIds).toEqual([id(200), id(201)]);
    expect(ImportStateSchema.safeParse(s).success).toBe(true);
    expect(checkImportInvariants(s)).toEqual([]);
  });
});

describe("schéma produit (non-régression)", () => {
  it("accepte les entrées actuelles et le nouveau champ importGroupId facultatif", () => {
    const input = { name: "Bogolan", price: null, images: [{ path: "u/products/1.webp" }] };
    const parsed = ProductInputSchema.parse(input);
    expect(parsed.status).toBe("active");
    expect(parsed.importGroupId).toBeUndefined();
    expect(ProductInputSchema.parse({ ...input, importGroupId: G1, status: "draft" }).importGroupId).toBe(G1);
    expect(ProductInputSchema.safeParse({ ...input, importGroupId: "pas-un-uuid" }).success).toBe(false);
  });

  it("brouillon vide par défaut", () => {
    expect(emptyDraft()).toMatchObject({ name: "", price: null, priceOnRequest: true, options: [] });
  });
});
