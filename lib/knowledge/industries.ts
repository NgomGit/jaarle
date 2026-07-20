export interface Industry {
  key: string;
  labelFr: string;
  colors: string[];
  toneHint: string;
  ctaExamples: string[];
  hashtags: string[];
  /** Éléments de mise en scène typiques du secteur, pour orienter la génération du fond IA. */
  visualDirection: string;
  /**
   * Secteurs où l'identité culturelle sénégalaise est un vrai angle créatif (mode, restauration,
   * événementiel, artisanat) — pas forcée sur des secteurs sans lien (électronique, pharmacie...).
   * Déclenche l'ajout d'une référence patrimoniale précise (voir lib/knowledge/senegal-heritage.ts).
   */
  culturalHeritage?: boolean;
}

export const industries: Industry[] = [
  {
    key: "fashion",
    labelFr: "Mode / Habillement",
    colors: ["couleurs vives", "wax", "or"],
    toneHint: "Élégant, tendance, valorisant.",
    ctaExamples: ["Commande ton look maintenant", "Dispo en plusieurs tailles"],
    hashtags: ["#ModeSenegal", "#Dakar", "#WaxStyle"],
    visualDirection: "seamless studio backdrop, editorial fashion lighting, clean fabric-like textures, runway-adjacent mood",
    culturalHeritage: true,
  },
  {
    key: "beauty",
    labelFr: "Beauté / Cosmétiques",
    colors: ["rose", "doré", "blanc"],
    toneHint: "Séduisant, confiant, soin de soi.",
    ctaExamples: ["Prends soin de toi", "Résultats visibles rapidement"],
    hashtags: ["#BeauteSenegal", "#SkinCare221", "#Dakar"],
    visualDirection: "soft glam lighting, marble or silk surface, delicate botanical accents, dewy glow",
  },
  {
    key: "restaurant",
    labelFr: "Restauration",
    colors: ["rouge", "orange", "chaleureux"],
    toneHint: "Gourmand, convivial, appétissant.",
    ctaExamples: ["Commande ton plat maintenant", "Livraison chaude et rapide"],
    hashtags: ["#FoodDakar", "#Ndogou", "#CuisineSenegalaise"],
    visualDirection: "warm ambient light, gentle steam, wooden table surface, fresh ingredients arranged artfully, shallow depth of field",
    culturalHeritage: true,
  },
  {
    key: "electronics",
    labelFr: "Électronique",
    colors: ["bleu", "noir", "gris technologique"],
    toneHint: "Fiable, moderne, orienté performance.",
    ctaExamples: ["Garantie incluse", "Stock limité, commande maintenant"],
    hashtags: ["#TechSenegal", "#Dakar", "#BonPlan"],
    visualDirection: "clean tech studio backdrop, cool blue accent lighting, reflective surface, minimal futuristic props",
  },
  {
    key: "furniture",
    labelFr: "Ameublement / Décoration",
    colors: ["marron chaud", "beige", "vert forêt"],
    toneHint: "Chaleureux, qualité, confort du foyer.",
    ctaExamples: ["Transforme ton salon", "Livraison et installation possibles"],
    hashtags: ["#DecoSenegal", "#Dakar", "#MaisonEtStyle"],
    visualDirection: "modern living room setting, natural wood tones, potted plant, soft daylight, contemporary African decor accents",
  },
  {
    key: "real-estate",
    labelFr: "Immobilier",
    colors: ["bleu marine", "or", "sobre"],
    toneHint: "Rassurant, sérieux, professionnel.",
    ctaExamples: ["Visite disponible sur rendez-vous", "Contacte-nous pour plus d'informations"],
    hashtags: ["#ImmobilierSenegal", "#Dakar", "#TerrainAVendre"],
    visualDirection: "golden hour sky, architectural framing, wide-angle real-estate photography feel, aspirational lifestyle",
  },
  {
    key: "automotive",
    labelFr: "Automobile",
    colors: ["noir", "rouge", "métallique"],
    toneHint: "Puissant, fiable, direct.",
    ctaExamples: ["Disponible immédiatement", "Contacte-nous pour les détails"],
    hashtags: ["#AutoSenegal", "#Dakar", "#Voiture221"],
    visualDirection: "dramatic studio or urban backdrop, dynamic low-angle framing, glossy reflective floor, bold shadows",
  },
  {
    key: "grocery",
    labelFr: "Épicerie / Alimentation générale",
    colors: ["vert", "jaune", "frais"],
    toneHint: "Pratique, frais, prix accessible.",
    ctaExamples: ["Prix imbattable", "Frais du jour"],
    hashtags: ["#EpicerieSenegal", "#Dakar", "#BonPrix"],
    visualDirection: "fresh market setting, natural daylight, wooden crates or woven baskets, vibrant natural colors",
  },
  {
    key: "pharmacy",
    labelFr: "Pharmacie / Santé",
    colors: ["vert", "blanc", "bleu médical"],
    toneHint: "Rassurant, fiable, sérieux.",
    ctaExamples: ["Disponible en pharmacie", "Conseil disponible sur demande"],
    hashtags: ["#SanteSenegal", "#Dakar"],
    visualDirection: "clean clinical-but-warm setting, soft white and green tones, subtle medical-adjacent props, reassuring atmosphere",
  },
  {
    key: "events",
    labelFr: "Événementiel",
    colors: ["or", "violet", "festif"],
    toneHint: "Festif, mémorable, exclusif.",
    ctaExamples: ["Réserve ta place", "Places limitées"],
    hashtags: ["#EvenementSenegal", "#Dakar"],
    visualDirection: "festive stage or venue backdrop, warm spotlight, subtle confetti or string lights, celebratory atmosphere",
    culturalHeritage: true,
  },
  {
    key: "hotel",
    labelFr: "Hôtellerie",
    colors: ["bleu ciel", "sable", "premium"],
    toneHint: "Accueillant, apaisant, premium.",
    ctaExamples: ["Réserve ton séjour", "Offre limitée"],
    hashtags: ["#HotelSenegal", "#Dakar", "#Voyage"],
    visualDirection: "resort or lobby setting, soft natural light, calm turquoise and sand palette, aspirational travel mood",
  },
  {
    key: "artisanat",
    labelFr: "Artisanat / Métiers d'art",
    colors: ["terre cuite", "indigo", "or"],
    toneHint: "Authentique, fait main, fier de son savoir-faire.",
    ctaExamples: ["Pièce faite main", "Savoir-faire artisanal sénégalais"],
    hashtags: ["#ArtisanatSenegal", "#FaitMain", "#Dakar"],
    visualDirection: "handcrafted textures, natural materials (leather, wood, clay, woven fiber), warm tactile lighting, artisan workshop mood",
    culturalHeritage: true,
  },
  {
    key: "travel",
    labelFr: "Agence de voyage",
    colors: ["turquoise", "sable", "évasion"],
    toneHint: "Évasion, aventure, accessible.",
    ctaExamples: ["Réserve ton voyage", "Places limitées"],
    hashtags: ["#VoyageSenegal", "#Dakar", "#Evasion"],
    visualDirection: "scenic destination backdrop, golden light, sense of horizon and movement, adventurous mood",
  },
];

export function getIndustry(key: string | undefined): Industry | undefined {
  return industries.find((i) => i.key === key);
}
