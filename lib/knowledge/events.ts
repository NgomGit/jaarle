// Base de connaissance culturelle — événements sénégalais.
// Les dates des fêtes musulmanes (Tabaski, Korité, Magal, Gamou) suivent le calendrier lunaire
// et sont estimées ; elles sont confirmées chaque année par observation de la lune.
// À maintenir à jour manuellement chaque année.

export interface SenegalEvent {
  key: string;
  name: string;
  /** Date ISO (YYYY-MM-DD) de l'édition 2026, estimée pour les fêtes lunaires. */
  date2026: string;
  /** Nombre de jours avant l'événement où la campagne devient pertinente. */
  leadDays: number;
  /** Nombre de jours après l'événement où il reste pertinent (ex: octave de Tabaski). */
  trailDays: number;
  culturalNote: string;
  tone: string;
  colors: string[];
  greetingsFr: string[];
  greetingsWo: string[];
  promotionalAngle: string;
  /** Choses à éviter dans le ton ou le message. */
  avoid?: string;
}

export const senegalEvents: SenegalEvent[] = [
  {
    key: "korite",
    name: "Korité (Aïd el-Fitr)",
    date2026: "2026-03-20",
    leadDays: 14,
    trailDays: 3,
    culturalNote: "Fin du Ramadan. Grande fête familiale, nouveaux habits, repas de fête, visites.",
    tone: "Joyeux, chaleureux, tourné vers la famille et le partage.",
    colors: ["blanc", "doré", "vert émeraude", "pastel"],
    greetingsFr: ["Joyeuse Korité !", "Bonne fête de la Korité à toi et ta famille."],
    greetingsWo: ["Korite wa ci jamm !", "Dewenati !"],
    promotionalAngle: "Nouveaux vêtements, cadeaux, décoration, produits de fête, beauté.",
  },
  {
    key: "tabaski",
    name: "Tabaski (Aïd el-Adha)",
    date2026: "2026-05-28",
    leadDays: 21,
    trailDays: 3,
    culturalNote:
      "Fête du mouton, la plus importante de l'année pour beaucoup de familles. Élégance, générosité, repas de fête, nouveaux habits pour toute la famille.",
    tone: "Festif, élégant, généreux, familial. Peut être premium/luxe.",
    colors: ["boubou wax coloré", "doré", "blanc", "bordeaux"],
    greetingsFr: ["Joyeuse Tabaski !", "Bonne fête de Tabaski à toute la famille."],
    greetingsWo: ["Tabaski wa ci jamm !", "Dewenati !"],
    promotionalAngle:
      "Habillement (boubous, tenues enfants), moutons/bétail, épices, décoration, cadeaux, beauté.",
  },
  {
    key: "tamkharit",
    name: "Tamkharit (Achoura)",
    date2026: "2026-06-25",
    leadDays: 7,
    trailDays: 1,
    culturalNote: "Nouvel an musulman. Repas traditionnel (couscous), déguisements pour enfants.",
    tone: "Convivial, traditionnel, familial.",
    colors: ["couleurs vives", "traditionnel"],
    greetingsFr: ["Bonne fête de Tamkharit !"],
    greetingsWo: ["Dewenati !"],
    promotionalAngle: "Ingrédients de cuisine, déguisements enfants, articles de fête.",
  },
  {
    key: "magal",
    name: "Grand Magal de Touba",
    date2026: "2026-08-01",
    leadDays: 10,
    trailDays: 2,
    culturalNote:
      "Pèlerinage religieux mouride à Touba, un des plus grands rassemblements du pays. Ton respectueux et spirituel — ce n'est PAS une fête commerciale comme Tabaski.",
    tone: "Respectueux, sobre, spirituel. Éviter tout ton promotionnel agressif ou décalé.",
    colors: ["blanc", "sobre", "discret"],
    greetingsFr: ["Bon Magal à tous les talibés.", "Puisse ce Magal vous apporter paix et bénédictions."],
    greetingsWo: ["Magal mbaa Yalla nanga ko dolli barke."],
    promotionalAngle:
      "Uniquement pertinent pour transport, hébergement, restauration à Touba, ou produits liés au voyage/pèlerinage. Éviter la promotion de produits de consommation générique avec un ton festif.",
    avoid: "Ne jamais utiliser un ton commercial agressif, de promo flash ou de réduction pendant le Magal.",
  },
  {
    key: "gamou",
    name: "Gamou (Mawlid)",
    date2026: "2026-08-26",
    leadDays: 10,
    trailDays: 2,
    culturalNote: "Commémoration de la naissance du Prophète. Veillées religieuses, chants (Bourd), grand rassemblement notamment à Tivaouane.",
    tone: "Respectueux, spirituel, sobre — proche du registre du Magal.",
    colors: ["blanc", "vert", "sobre"],
    greetingsFr: ["Bon Gamou à tous.", "Puisse ce Gamou vous apporter paix et bénédictions."],
    greetingsWo: ["Gamou mbaa Yalla nanga ko dolli barke."],
    promotionalAngle: "Transport, hébergement, tenues sobres. Éviter le ton promotionnel classique.",
    avoid: "Ne jamais utiliser un ton commercial agressif, de promo flash ou de réduction pendant le Gamou.",
  },
  {
    key: "ramadan",
    name: "Ramadan",
    date2026: "2026-02-18",
    leadDays: 7,
    trailDays: 30,
    culturalNote:
      "Mois de jeûne. Rythme de vie modifié, repas de rupture du jeûne (Ndogou) en famille, générosité (Zakat), spiritualité.",
    tone: "Respectueux, apaisé. Peut mentionner le Ndogou pour l'alimentation, mais rester sobre pour le reste.",
    colors: ["vert", "doré", "blanc", "tons doux"],
    greetingsFr: ["Ramadan Moubarak !", "Bon mois béni à toi et ta famille."],
    greetingsWo: ["Ramadan Moubarak !"],
    promotionalAngle: "Alimentation pour le Ndogou, dattes, tenues de prière, articles religieux, générosité/dons.",
  },
  {
    key: "independence",
    name: "Fête de l'Indépendance",
    date2026: "2026-04-04",
    leadDays: 5,
    trailDays: 1,
    culturalNote: "Fête nationale du Sénégal. Fierté nationale, défilés.",
    tone: "Fier, patriotique, festif.",
    colors: ["vert", "jaune", "rouge (drapeau sénégalais)"],
    greetingsFr: ["Joyeuse fête de l'Indépendance !", "Bon 4 avril à tout le Sénégal !"],
    greetingsWo: ["Yal na Senegal am jamm ak natt !"],
    promotionalAngle: "Produits locaux, artisanat, mode aux couleurs du drapeau.",
  },
  {
    key: "rentree",
    name: "Rentrée scolaire",
    date2026: "2026-10-01",
    leadDays: 30,
    trailDays: 7,
    culturalNote: "Rentrée des classes, période de forte dépense pour les familles (fournitures, uniformes).",
    tone: "Pratique, rassurant, orienté famille et budget.",
    colors: ["bleu", "couleurs scolaires vives"],
    greetingsFr: ["Bonne rentrée à tous les élèves !"],
    greetingsWo: ["Bon rentrée !"],
    promotionalAngle: "Fournitures scolaires, cartables, uniformes, chaussures, vêtements enfants.",
  },
  {
    key: "valentine",
    name: "Saint-Valentin",
    date2026: "2026-02-14",
    leadDays: 10,
    trailDays: 1,
    culturalNote: "Fête des amoureux, de plus en plus populaire en milieu urbain.",
    tone: "Romantique, chaleureux.",
    colors: ["rouge", "rose", "blanc"],
    greetingsFr: ["Joyeuse Saint-Valentin !"],
    greetingsWo: ["Joyeuse Saint-Valentin !"],
    promotionalAngle: "Cadeaux, fleurs, chocolats, bijoux, restaurants, cosmétiques.",
  },
  {
    key: "fete-meres",
    name: "Fête des Mères",
    date2026: "2026-05-31",
    leadDays: 14,
    trailDays: 1,
    culturalNote: "Célébration des mères, dernier dimanche de mai (tradition francophone).",
    tone: "Tendre, reconnaissant.",
    colors: ["rose", "pastel", "floral"],
    greetingsFr: ["Bonne fête à toutes les mamans !"],
    greetingsWo: ["Bonne fête yaay yi !"],
    promotionalAngle: "Cadeaux, beauté, bijoux, fleurs, textile.",
  },
  {
    key: "fete-peres",
    name: "Fête des Pères",
    date2026: "2026-06-21",
    leadDays: 14,
    trailDays: 1,
    culturalNote: "Célébration des pères, troisième dimanche de juin (tradition francophone).",
    tone: "Chaleureux, respectueux.",
    colors: ["bleu", "gris", "tons sobres"],
    greetingsFr: ["Bonne fête à tous les papas !"],
    greetingsWo: ["Bonne fête baay yi !"],
    promotionalAngle: "Cadeaux, mode homme, électronique, accessoires.",
  },
  {
    key: "nouvel-an",
    name: "Nouvel An",
    date2026: "2027-01-01",
    leadDays: 10,
    trailDays: 2,
    culturalNote: "Passage à la nouvelle année, célébrations, bilans, nouveaux projets.",
    tone: "Festif, optimiste, tourné vers l'avenir.",
    colors: ["or", "argent", "noir", "blanc"],
    greetingsFr: ["Bonne année !", "Meilleurs vœux pour cette nouvelle année."],
    greetingsWo: ["Dewenati !"],
    promotionalAngle: "Cadeaux, mode, électronique, offres de nouvelle année.",
  },
];

/**
 * Retourne les événements pertinents autour d'une date donnée (fenêtre leadDays avant / trailDays après),
 * triés par proximité. Gère le passage d'année en comparant sur un cycle glissant simple.
 */
export function getRelevantEvents(referenceDate: Date, maxResults = 2): SenegalEvent[] {
  const scored = senegalEvents
    .map((event) => {
      const eventDate = new Date(event.date2026);
      const diffDays = Math.round((eventDate.getTime() - referenceDate.getTime()) / 86_400_000);
      const relevant = diffDays >= -event.trailDays && diffDays <= event.leadDays;
      return { event, diffDays: Math.abs(diffDays), relevant };
    })
    .filter((e) => e.relevant)
    .sort((a, b) => a.diffDays - b.diffDays)
    .slice(0, maxResults)
    .map((e) => e.event);

  return scored;
}
