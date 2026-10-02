"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { MarketCategoryPicker } from "@/components/market/market-category-picker";
import { BOOST_PLACEMENTS } from "@/lib/admin/market";

// Formulaire de création d'une mise en avant : la liste des produits suit la boutique choisie.

type Option = { value: string; label: string };

export function BoostForm({
  action,
  shops,
  products,
  cities,
  today,
  inAWeek,
}: {
  action: (fd: FormData) => void | Promise<void>;
  shops: Option[];
  products: { id: string; name: string; shopId: string }[];
  cities: Option[];
  today: string;
  inAWeek: string;
}) {
  const [shopId, setShopId] = React.useState(shops[0]?.value ?? "");
  const [placement, setPlacement] = React.useState<string>("banner");
  const shopProducts = products.filter((p) => p.shopId === shopId);
  const field = "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm";
  const label = "flex flex-col gap-1 text-xs font-medium text-muted-foreground";

  if (shops.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune boutique Pro sur le Market pour l&apos;instant : les mises en avant sont réservées aux Pro.</p>;
  }

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Emplacement</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {BOOST_PLACEMENTS.map((p) => (
            <label key={p.key} className="flex cursor-pointer gap-2.5 rounded-xl border border-input p-3 has-[:checked]:border-primary has-[:checked]:bg-accent">
              <input type="radio" name="placement" value={p.key} checked={placement === p.key} onChange={() => setPlacement(p.key)} className="mt-0.5" />
              <span>
                <span className="block text-sm font-semibold">{p.label}</span>
                <span className="block text-xs text-muted-foreground">{p.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className={label}>
        Boutique Pro
        <select name="shopId" value={shopId} onChange={(e) => setShopId(e.target.value)} className={field} required>
          {shops.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Produit mis en avant
        <select name="productId" className={field} defaultValue="" key={shopId}>
          <option value="">Toute la boutique</option>
          {shopProducts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {placement === "banner" && (
        <>
          <label className={label}>
            Titre de la bannière
            <input name="title" required maxLength={80} placeholder="Ex. : Collection Tabaski -20 %" className={field} />
          </label>
          <label className={label}>
            Texte du bouton (facultatif)
            <input name="cta" maxLength={30} placeholder="Voir la boutique" className={field} />
          </label>
          <label className={`${label} sm:col-span-2`}>
            Sous-titre (facultatif)
            <input name="subtitle" maxLength={160} placeholder="Livraison partout à Dakar, paiement Wave ou Orange Money" className={field} />
          </label>
        </>
      )}

      <div className={label}>
        Catégorie ciblée
        <MarketCategoryPicker name="category" value="" allowGroups size="sm" placeholder="Partout" />
      </div>
      <label className={label}>
        Ville ciblée
        <select name="city" className={field} defaultValue="">
          <option value="">Tout le Sénégal</option>
          {cities.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Du
        <input type="date" name="startsOn" defaultValue={today} required className={field} />
      </label>
      <label className={label}>
        Au (inclus)
        <input type="date" name="endsOn" defaultValue={inAWeek} required className={field} />
      </label>
      <label className={label}>
        Priorité (la plus haute passe devant)
        <input type="number" name="priority" defaultValue={0} min={-100} max={100} className={field} />
      </label>
      <div className="flex items-end">
        <Button type="submit" className="w-full sm:w-auto">
          Créer la mise en avant
        </Button>
      </div>
    </form>
  );
}
