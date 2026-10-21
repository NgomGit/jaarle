// Numéro WhatsApp Business de Jaarle (app WhatsApp Business, statuts). Les vendeurs voient les
// statuts de Jaarle seulement si les deux numéros sont enregistrés dans les contacts l'un de l'autre :
//  - côté Jaarle : export .vcf des vendeurs (admin → Relances → WhatsApp non vérifié) ;
//  - côté vendeur : fiche contact /jaarle.vcf (bouton dans le tableau de bord).
// Ce n'est PAS le numéro de l'API WhatsApp Cloud qui reçoit les codes de vérification.

export const JAARLE_STATUS_NUMBER = "+221771350203";
export const JAARLE_STATUS_NUMBER_DISPLAY = "77 135 02 03";

/** Échappe une valeur vCard 3.0 (\, ; , et retours à la ligne). */
export function vcardEscape(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

export interface VcardContact {
  /** Nom affiché dans le carnet. */
  name: string;
  /** Numéro au format E.164 (+221…). */
  phone: string;
  org?: string | null;
  note?: string | null;
  url?: string | null;
}

/** Une fiche vCard 3.0 (lue par iPhone, Android et WhatsApp). */
export function vcard(c: VcardContact): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${vcardEscape(c.name)}`,
    `N:${vcardEscape(c.name)};;;;`,
    `TEL;TYPE=CELL:${c.phone.replace(/[^\d+]/g, "")}`,
  ];
  if (c.org) lines.push(`ORG:${vcardEscape(c.org)}`);
  if (c.url) lines.push(`URL:${vcardEscape(c.url)}`);
  if (c.note) lines.push(`NOTE:${vcardEscape(c.note)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

/** Numéro sénégalais en E.164 (+221XXXXXXXXX), ou null s'il est inexploitable. */
export function senegalE164(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 9) return `+221${d}`;
  if (d.length === 12 && d.startsWith("221")) return `+${d}`;
  return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
}
