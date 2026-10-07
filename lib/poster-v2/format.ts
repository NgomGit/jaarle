// Formatage des informations commerciales (exactes, jamais générées par l'IA).

/** « 25 000 FCFA » (espace insécable) ou « Sur devis ». */
export function formatPrice(price: number | null | undefined): { amount: string | null; currency: string | null; label: string } {
  if (price == null || !Number.isFinite(price) || price <= 0) return { amount: null, currency: null, label: "Sur devis" };
  const amount = Math.round(price)
    .toLocaleString("fr-FR")
    .replace(/[ \s]/g, " ");
  return { amount, currency: "FCFA", label: `${amount} FCFA` };
}

/** Premier numéro, au format sénégalais « +221 77 652 45 79 » quand c'est possible. */
export function formatPhone(raw: string | null | undefined): string {
  const first = (raw ?? "").split("|")[0]?.trim() ?? "";
  const digits = first.replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("221") ? digits.slice(3) : digits.length === 9 ? digits : null;
  if (local) return `+221 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7)}`;
  return first;
}

export const DEFAULT_CTA = "Commander sur WhatsApp";
