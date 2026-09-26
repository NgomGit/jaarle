export type StudioObjective = "sell" | "present" | "promo" | "new";

export interface ObjectiveSpec {
  key: StudioObjective;
  label: string;
  hint: string;
  guidance: string;
}

export const OBJECTIVES: ObjectiveSpec[] = [
  {
    key: "sell",
    label: "Vendre",
    hint: "Pousser à commander maintenant",
    guidance: "Objectif : déclencher l'achat. Mettre en avant le bénéfice principal et un appel à l'action clair pour commander sur WhatsApp.",
  },
  {
    key: "present",
    label: "Présenter",
    hint: "Faire découvrir le produit",
    guidance: "Objectif : faire découvrir le produit, raconter à quoi il sert et pour qui. Ton informatif et chaleureux, appel à l'action plus doux (en savoir plus, poser une question).",
  },
  {
    key: "promo",
    label: "Promotion",
    hint: "Mettre en avant une offre",
    guidance:
      "Objectif : annoncer l'offre décrite par le commerçant dans « Offre », MOT POUR MOT sur les chiffres et conditions. Ne jamais ajouter de remise, de pourcentage, de durée ou de condition qui n'y figure pas.",
  },
  {
    key: "new",
    label: "Nouveauté",
    hint: "Annoncer un nouvel arrivage",
    guidance: "Objectif : annoncer que le produit est nouveau / vient d'arriver dans la boutique. Créer de la curiosité, sans inventer de quantité limitée ni de délai.",
  },
];

export const OBJECTIVE_BY_KEY = Object.fromEntries(OBJECTIVES.map((o) => [o.key, o])) as Record<StudioObjective, ObjectiveSpec>;
