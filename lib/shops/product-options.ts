// Saisie des options produit (tailles, couleurs, pointures…) : texte libre → liste de choix.

export const OPTION_VALUE_MAX = 30;
export const OPTION_VALUES_MAX = 20;

/**
 * « M, L, XL » → ["M", "L", "XL"]. Séparateurs acceptés : virgule, point-virgule, barre, retour
 * à la ligne. Beaucoup de vendeurs séparent par des espaces (« M L xl xxl ») : si aucun séparateur
 * n'est utilisé et que chaque mot est court (tailles, pointures), les espaces séparent aussi.
 * Une saisie comme « Rose poudré » reste un seul choix. Doublons retirés (sans tenir compte de la casse).
 */
export function parseOptionValues(raw: string): string[] {
  let parts = raw
    .split(/[,;/\n]+/)
    .map((v) => v.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  if (parts.length === 1 && !/[,;/\n]/.test(raw)) {
    const words = parts[0].split(" ");
    if (words.length > 1 && words.every((w) => w.length <= 4)) parts = words;
  }
  const seen = new Set<string>();
  return parts.filter((v) => {
    const key = v.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Message d'erreur en français pour une option, ou null si elle est valide. */
export function optionValuesError(name: string, values: string[]): string | null {
  const label = name.trim() || "Option";
  const tooLong = values.find((v) => v.length > OPTION_VALUE_MAX);
  if (tooLong) {
    return `${label} : « ${tooLong.slice(0, 24)}… » est trop long (${OPTION_VALUE_MAX} caractères max par choix). Sépare les choix par des virgules, ex. Vert, Rose, Noir.`;
  }
  if (values.length > OPTION_VALUES_MAX) return `${label} : ${OPTION_VALUES_MAX} choix maximum.`;
  return null;
}
