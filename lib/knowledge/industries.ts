export interface Industry {
  key: string;
  labelFr: string;
  colors: string[];
  toneHint: string;
  ctaExamples: string[];
  hashtags: string[];
}

export const industries: Industry[] = [
  {
    key: "fashion",
    labelFr: "Mode / Habillement",
    colors: ["couleurs vives", "wax", "or"],
    toneHint: "Élégant, tendance, valorisant.",
    ctaExamples: ["Commande ton look maintenant", "Dispo en plusieurs tailles"],
    hashtags: ["#ModeSenegal", "#Dakar", "#WaxStyle"],
  },
  {
    key: "beauty",
    labelFr: "Beauté / Cosmétiques",
    colors: ["rose", "doré", "blanc"],
    toneHint: "Séduisant, confiant, soin de soi.",
    ctaExamples: ["Prends soin de toi", "Résultats visibles rapidement"],
    hashtags: ["#BeauteSenegal", "#SkinCare221", "#Dakar"],
  },
  {
    key: "restaurant",
    labelFr: "Restauration",
    colors: ["rouge", "orange", "chaleureux"],
    toneHint: "Gourmand, convivial, appétissant.",
    ctaExamples: ["Commande ton plat maintenant", "Livraison chaude et rapide"],
    hashtags: ["#FoodDakar", "#Ndogou", "#CuisineSenegalaise"],
  },
  {
    key: "electronics",
    labelFr: "Électronique",
    colors: ["bleu", "noir", "gris technologique"],
    toneHint: "Fiable, moderne, orienté performance.",
    ctaExamples: ["Garantie incluse", "Stock limité, commande maintenant"],
    hashtags: ["#TechSenegal", "#Dakar", "#BonPlan"],
  },
  {
    key: "furniture",
    labelFr: "Ameublement / Décoration",
    colors: ["marron chaud", "beige", "vert forêt"],
    toneHint: "Chaleureux, qualité, confort du foyer.",
    ctaExamples: ["Transforme ton salon", "Livraison et installation possibles"],
    hashtags: ["#DecoSenegal", "#Dakar", "#MaisonEtStyle"],
  },
  {
    key: "real-estate",
    labelFr: "Immobilier",
    colors: ["bleu marine", "or", "sobre"],
    toneHint: "Rassurant, sérieux, professionnel.",
    ctaExamples: ["Visite disponible sur rendez-vous", "Contacte-nous pour plus d'informations"],
    hashtags: ["#ImmobilierSenegal", "#Dakar", "#TerrainAVendre"],
  },
  {
    key: "automotive",
    labelFr: "Automobile",
    colors: ["noir", "rouge", "métallique"],
    toneHint: "Puissant, fiable, direct.",
    ctaExamples: ["Disponible immédiatement", "Contacte-nous pour les détails"],
    hashtags: ["#AutoSenegal", "#Dakar", "#Voiture221"],
  },
  {
    key: "grocery",
    labelFr: "Épicerie / Alimentation générale",
    colors: ["vert", "jaune", "frais"],
    toneHint: "Pratique, frais, prix accessible.",
    ctaExamples: ["Prix imbattable", "Frais du jour"],
    hashtags: ["#EpicerieSenegal", "#Dakar", "#BonPrix"],
  },
  {
    key: "pharmacy",
    labelFr: "Pharmacie / Santé",
    colors: ["vert", "blanc", "bleu médical"],
    toneHint: "Rassurant, fiable, sérieux.",
    ctaExamples: ["Disponible en pharmacie", "Conseil disponible sur demande"],
    hashtags: ["#SanteSenegal", "#Dakar"],
  },
  {
    key: "events",
    labelFr: "Événementiel",
    colors: ["or", "violet", "festif"],
    toneHint: "Festif, mémorable, exclusif.",
    ctaExamples: ["Réserve ta place", "Places limitées"],
    hashtags: ["#EvenementSenegal", "#Dakar"],
  },
  {
    key: "hotel",
    labelFr: "Hôtellerie",
    colors: ["bleu ciel", "sable", "premium"],
    toneHint: "Accueillant, apaisant, premium.",
    ctaExamples: ["Réserve ton séjour", "Offre limitée"],
    hashtags: ["#HotelSenegal", "#Dakar", "#Voyage"],
  },
  {
    key: "travel",
    labelFr: "Agence de voyage",
    colors: ["turquoise", "sable", "évasion"],
    toneHint: "Évasion, aventure, accessible.",
    ctaExamples: ["Réserve ton voyage", "Places limitées"],
    hashtags: ["#VoyageSenegal", "#Dakar", "#Evasion"],
  },
];

export function getIndustry(key: string | undefined): Industry | undefined {
  return industries.find((i) => i.key === key);
}
