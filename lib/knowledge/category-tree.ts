import {
  type LucideIcon,
  Shirt,
  Sparkles,
  UtensilsCrossed,
  Smartphone,
  Sofa,
  Building2,
  Car,
  ShoppingBasket,
  Pill,
  PartyPopper,
  BedDouble,
  Plane,
  Palette,
  Fish,        // + nouveau
  Sprout,      // + nouveau (agriculture / élevage)
  Wrench,      // + nouveau (services & artisans)
} from "lucide-react";

// Arborescence élargie (catégorie > sous-catégorie > feuille) pour le sélecteur de secteur.
// RAPPEL (inchangé) : la valeur stockée/envoyée à l'IA reste `industryKey`. Les feuilles ne sont
// qu'une aide de navigation → en ajouter est SANS RISQUE. En revanche, tout `industryKey` utilisé
// ici doit exister dans lib/knowledge/industries.ts (voir industries-additions.ts pour les 3
// nouveaux secteurs : poissonnerie, agriculture, services).

export interface CategoryLeaf {
  key: string;
  label: string;
}
export interface CategorySub {
  key: string;
  label: string;
  leaves: CategoryLeaf[];
}
export interface CategoryNode {
  industryKey: string;
  label: string;
  icon: LucideIcon;
  subCategories: CategorySub[];
}

export const categoryTree: CategoryNode[] = [
  {
    industryKey: "fashion",
    label: "Mode / Habillement",
    icon: Shirt,
    subCategories: [
      {
        key: "vetements-femme",
        label: "Vêtements femme",
        leaves: [
          { key: "robes", label: "Robes" },
          { key: "tailleurs-femme", label: "Tailleurs & ensembles" },
          { key: "boubous-femme", label: "Boubous & grand boubou" },
          { key: "tenues-wax", label: "Tenues en wax / pagne" },
          { key: "voiles-abayas", label: "Abayas & voiles" },
        ],
      },
      {
        key: "vetements-homme",
        label: "Vêtements homme",
        leaves: [
          { key: "ensembles-homme", label: "Ensembles homme" },
          { key: "boubous-homme", label: "Boubous & caftans" },
          { key: "chemises-tshirts", label: "Chemises & t-shirts" },
          { key: "costumes", label: "Costumes" },
        ],
      },
      {
        key: "enfant-bebe",
        label: "Enfant & bébé",
        leaves: [
          { key: "enfant", label: "Vêtements enfant" },
          { key: "bebe", label: "Vêtements bébé" },
          { key: "ceremonie-enfant", label: "Tenues de cérémonie" },
        ],
      },
      {
        key: "chaussures",
        label: "Chaussures",
        leaves: [
          { key: "sneakers", label: "Sneakers" },
          { key: "sandales", label: "Sandales & chaussures traditionnelles" },
          { key: "escarpins", label: "Escarpins & talons" },
          { key: "chaussures-homme", label: "Chaussures homme" },
        ],
      },
      {
        key: "accessoires-mode",
        label: "Accessoires",
        leaves: [
          { key: "sacs", label: "Sacs & pochettes" },
          { key: "bijoux", label: "Bijoux & montres" },
          { key: "foulards", label: "Foulards & châles" },
          { key: "lunettes", label: "Lunettes" },
        ],
      },
      {
        key: "couture-mesure",
        label: "Couture / Sur-mesure",
        leaves: [
          { key: "tailleur-sur-mesure", label: "Tailleur sur-mesure" },
          { key: "broderie", label: "Broderie & finitions" },
          { key: "retouches", label: "Retouches" },
        ],
      },
    ],
  },
  {
    industryKey: "beauty",
    label: "Beauté / Cosmétiques",
    icon: Sparkles,
    subCategories: [
      {
        key: "soin-peau",
        label: "Soin de la peau",
        leaves: [
          { key: "creme-visage", label: "Crèmes & soins visage" },
          { key: "soin-corps", label: "Produits pour le corps" },
          { key: "huiles-karite", label: "Beurre de karité & huiles" },
          { key: "savons-naturels", label: "Savons naturels" },
          { key: "eclaircissants", label: "Soins éclaircissants" },
        ],
      },
      {
        key: "maquillage",
        label: "Maquillage",
        leaves: [
          { key: "teint-levres", label: "Rouge à lèvres & teint" },
          { key: "palettes", label: "Palettes & accessoires" },
          { key: "faux-cils", label: "Faux-cils & regard" },
        ],
      },
      {
        key: "cheveux",
        label: "Cheveux",
        leaves: [
          { key: "perruques", label: "Perruques & tissages" },
          { key: "produits-capillaires", label: "Produits capillaires" },
          { key: "meches", label: "Mèches & extensions" },
        ],
      },
      {
        key: "parfums",
        label: "Parfums & encens",
        leaves: [
          { key: "parfums", label: "Parfums" },
          { key: "thiouraye", label: "Thiouraye & encens" },
        ],
      },
    ],
  },
  {
    industryKey: "restaurant",
    label: "Restauration",
    icon: UtensilsCrossed,
    subCategories: [
      {
        key: "plats",
        label: "Plats",
        leaves: [
          { key: "plats-traditionnels", label: "Plats traditionnels (thieb, yassa, mafé)" },
          { key: "grillades", label: "Grillades & dibiterie" },
          { key: "fast-food", label: "Fast-food & snacking" },
          { key: "petit-dej", label: "Petit-déjeuner & ndogou" },
        ],
      },
      {
        key: "patisserie",
        label: "Pâtisserie",
        leaves: [
          { key: "gateaux", label: "Gâteaux & desserts" },
          { key: "gateaux-ceremonie", label: "Gâteaux de cérémonie" },
          { key: "boulangerie", label: "Boulangerie & viennoiserie" },
        ],
      },
      {
        key: "boissons-resto",
        label: "Boissons",
        leaves: [
          { key: "jus-locaux", label: "Jus & boissons locales (bissap, bouye)" },
          { key: "cafe-the", label: "Café Touba & thé" },
          { key: "smoothies", label: "Smoothies & cocktails sans alcool" },
        ],
      },
      {
        key: "traiteur",
        label: "Traiteur",
        leaves: [
          { key: "traiteur-evenement", label: "Traiteur événementiel" },
          { key: "plats-a-emporter", label: "Plats à emporter / au kilo" },
        ],
      },
    ],
  },
  {
    // ===== NOUVEAU SECTEUR =====
    industryKey: "poissonnerie",
    label: "Poissonnerie / Produits de la mer",
    icon: Fish,
    subCategories: [
      {
        key: "poissons-frais",
        label: "Poissons frais",
        leaves: [
          { key: "thiof", label: "Thiof & mérou" },
          { key: "dorade", label: "Dorade & carpe" },
          { key: "yaboy", label: "Sardinelle (yaboy)" },
          { key: "capitaine", label: "Capitaine & sole" },
          { key: "poisson-entier", label: "Poisson entier au kilo" },
        ],
      },
      {
        key: "fruits-de-mer",
        label: "Fruits de mer",
        leaves: [
          { key: "crevettes", label: "Crevettes & gambas" },
          { key: "huitres", label: "Huîtres & coquillages" },
          { key: "langouste-crabe", label: "Langoustes & crabes" },
          { key: "calamars", label: "Calamars & seiches" },
        ],
      },
      {
        key: "poisson-transforme",
        label: "Poisson transformé",
        leaves: [
          { key: "poisson-seche", label: "Poisson séché (kéthiakh, guedj)" },
          { key: "poisson-fume", label: "Poisson fumé" },
          { key: "yeet-toufa", label: "Yeet & tofa" },
        ],
      },
    ],
  },
  {
    // ===== NOUVEAU SECTEUR =====
    industryKey: "agriculture",
    label: "Agriculture / Élevage",
    icon: Sprout,
    subCategories: [
      {
        key: "fruits",
        label: "Fruits",
        leaves: [
          { key: "mangue", label: "Mangues" },
          { key: "pasteque-melon", label: "Pastèques & melons" },
          { key: "agrumes", label: "Agrumes & papayes" },
        ],
      },
      {
        key: "legumes-cereales",
        label: "Légumes & céréales",
        leaves: [
          { key: "legumes-frais", label: "Légumes frais" },
          { key: "cereales", label: "Mil, maïs & riz local" },
          { key: "arachide-niebe", label: "Arachide & niébé" },
        ],
      },
      {
        key: "elevage",
        label: "Élevage",
        leaves: [
          { key: "moutons-tabaski", label: "Moutons (Tabaski)" },
          { key: "volaille", label: "Volaille & œufs" },
          { key: "betail", label: "Bétail & viande" },
        ],
      },
      {
        key: "produits-fermiers",
        label: "Produits fermiers",
        leaves: [
          { key: "lait-caille", label: "Lait caillé & produits laitiers" },
          { key: "miel", label: "Miel & produits de la ruche" },
        ],
      },
    ],
  },
  {
    industryKey: "electronics",
    label: "Électronique",
    icon: Smartphone,
    subCategories: [
      {
        key: "telephonie",
        label: "Téléphonie",
        leaves: [
          { key: "smartphones", label: "Smartphones" },
          { key: "telephones-reconditionnes", label: "Téléphones reconditionnés" },
          { key: "accessoires-tel", label: "Accessoires téléphone" },
        ],
      },
      {
        key: "informatique",
        label: "Informatique",
        leaves: [
          { key: "ordinateurs", label: "Ordinateurs" },
          { key: "accessoires-info", label: "Accessoires informatiques" },
          { key: "imprimantes", label: "Imprimantes & consommables" },
        ],
      },
      {
        key: "electromenager",
        label: "Électroménager",
        leaves: [
          { key: "petit-electromenager", label: "Petit électroménager" },
          { key: "gros-electromenager", label: "Gros électroménager" },
          { key: "clim-ventilation", label: "Climatiseurs & ventilation" },
        ],
      },
      {
        key: "audio-tv",
        label: "Audio / TV",
        leaves: [
          { key: "tv", label: "Téléviseurs" },
          { key: "enceintes", label: "Enceintes & son" },
        ],
      },
    ],
  },
  {
    industryKey: "furniture",
    label: "Ameublement / Décoration",
    icon: Sofa,
    subCategories: [
      {
        key: "meubles",
        label: "Meubles",
        leaves: [
          { key: "salon", label: "Salon" },
          { key: "chambre", label: "Chambre" },
          { key: "salle-a-manger", label: "Salle à manger" },
          { key: "bureau", label: "Bureau" },
        ],
      },
      {
        key: "decoration",
        label: "Décoration",
        leaves: [
          { key: "objets-deco", label: "Objets déco" },
          { key: "luminaires", label: "Luminaires" },
          { key: "miroirs", label: "Miroirs & cadres" },
        ],
      },
      {
        key: "textile-maison",
        label: "Textile maison",
        leaves: [
          { key: "rideaux-tapis", label: "Rideaux & tapis" },
          { key: "linge-lit", label: "Linge de lit" },
        ],
      },
    ],
  },
  {
    industryKey: "real-estate",
    label: "Immobilier",
    icon: Building2,
    subCategories: [
      {
        key: "vente-immo",
        label: "Vente",
        leaves: [
          { key: "appartements-vente", label: "Appartements" },
          { key: "villas", label: "Villas & maisons" },
          { key: "immeubles", label: "Immeubles" },
        ],
      },
      {
        key: "location-immo",
        label: "Location",
        leaves: [
          { key: "appartements-location", label: "Appartements à louer" },
          { key: "chambres-studios", label: "Chambres & studios" },
          { key: "meuble-court-sejour", label: "Meublé / courte durée" },
        ],
      },
      {
        key: "terrains",
        label: "Terrains",
        leaves: [
          { key: "terrains-vente", label: "Terrains à vendre" },
          { key: "terrains-agricoles", label: "Terrains agricoles" },
        ],
      },
    ],
  },
  {
    industryKey: "automotive",
    label: "Automobile",
    icon: Car,
    subCategories: [
      {
        key: "vehicules",
        label: "Véhicules",
        leaves: [
          { key: "voitures", label: "Voitures" },
          { key: "motos", label: "Motos & scooters" },
          { key: "utilitaires", label: "Utilitaires & camions" },
        ],
      },
      {
        key: "pieces-auto",
        label: "Pièces & accessoires",
        leaves: [
          { key: "pieces-detachees", label: "Pièces détachées" },
          { key: "pneus", label: "Pneus & jantes" },
          { key: "accessoires-auto", label: "Accessoires auto" },
        ],
      },
      {
        key: "location-vehicule",
        label: "Location",
        leaves: [{ key: "location-voiture", label: "Location de voiture" }],
      },
    ],
  },
  {
    industryKey: "grocery",
    label: "Épicerie / Alimentation générale",
    icon: ShoppingBasket,
    subCategories: [
      {
        key: "alimentation",
        label: "Alimentation",
        leaves: [
          { key: "produits-base", label: "Produits de base (riz, huile, sucre)" },
          { key: "epices", label: "Épices & condiments" },
          { key: "conserves", label: "Conserves & pâtes" },
        ],
      },
      {
        key: "frais",
        label: "Frais",
        leaves: [
          { key: "fruits-legumes", label: "Fruits & légumes" },
          { key: "produits-laitiers", label: "Produits laitiers & œufs" },
        ],
      },
      {
        key: "boissons-epicerie",
        label: "Boissons",
        leaves: [
          { key: "boissons-eau", label: "Boissons & eau" },
          { key: "jus-sirops", label: "Jus & sirops" },
        ],
      },
    ],
  },
  {
    // ===== NOUVEAU SECTEUR =====
    industryKey: "services",
    label: "Services & artisans",
    icon: Wrench,
    subCategories: [
      {
        key: "beaute-services",
        label: "Coiffure & beauté",
        leaves: [
          { key: "salon-coiffure", label: "Salon de coiffure" },
          { key: "barbier", label: "Barbier" },
          { key: "tresses", label: "Tresses & nattes" },
          { key: "onglerie", label: "Onglerie & manucure" },
          { key: "maquilleuse", label: "Maquilleuse / make-up" },
        ],
      },
      {
        key: "batiment",
        label: "Bâtiment",
        leaves: [
          { key: "plomberie", label: "Plomberie" },
          { key: "electricite", label: "Électricité" },
          { key: "maconnerie", label: "Maçonnerie & carrelage" },
          { key: "peinture", label: "Peinture & décoration" },
          { key: "menuiserie", label: "Menuiserie & aluminium" },
        ],
      },
      {
        key: "maison-services",
        label: "Maison",
        leaves: [
          { key: "menage", label: "Ménage & nettoyage" },
          { key: "demenagement", label: "Déménagement" },
          { key: "jardinage", label: "Jardinage" },
          { key: "froid-clim", label: "Froid & climatisation" },
        ],
      },
      {
        key: "pro-services",
        label: "Services pro",
        leaves: [
          { key: "photographe", label: "Photographe / vidéaste" },
          { key: "impression", label: "Imprimerie & sérigraphie" },
          { key: "informatique-service", label: "Dépannage informatique" },
          { key: "lavage-auto", label: "Lavage auto" },
        ],
      },
    ],
  },
  {
    industryKey: "pharmacy",
    label: "Pharmacie / Santé",
    icon: Pill,
    subCategories: [
      {
        key: "medicaments",
        label: "Médicaments",
        leaves: [{ key: "medicaments-courants", label: "Médicaments courants" }],
      },
      {
        key: "parapharmacie",
        label: "Parapharmacie",
        leaves: [
          { key: "complements", label: "Compléments alimentaires" },
          { key: "hygiene", label: "Soins & hygiène" },
          { key: "bebe-maman", label: "Bébé & maman" },
          { key: "materiel-medical", label: "Matériel médical" },
        ],
      },
      {
        key: "optique",
        label: "Optique",
        leaves: [{ key: "lunettes-vue", label: "Lunettes de vue" }],
      },
    ],
  },
  {
    industryKey: "events",
    label: "Événementiel",
    icon: PartyPopper,
    subCategories: [
      {
        key: "mariage",
        label: "Mariage",
        leaves: [
          { key: "organisation-mariage", label: "Organisation mariage" },
          { key: "decoration-mariage", label: "Décoration mariage" },
          { key: "location-materiel", label: "Location de matériel & bâches" },
        ],
      },
      {
        key: "ceremonies",
        label: "Cérémonies",
        leaves: [
          { key: "bapteme", label: "Baptême" },
          { key: "anniversaire", label: "Anniversaire" },
        ],
      },
      {
        key: "corporate",
        label: "Corporate & spectacles",
        leaves: [
          { key: "evenements-entreprise", label: "Événements d'entreprise" },
          { key: "concerts", label: "Concerts & soirées" },
          { key: "location-son", label: "Sonorisation & DJ" },
        ],
      },
    ],
  },
  {
    industryKey: "artisanat",
    label: "Artisanat / Métiers d'art",
    icon: Palette,
    subCategories: [
      {
        key: "cuir-maroquinerie",
        label: "Cuir & maroquinerie",
        leaves: [
          { key: "sacs-cuir", label: "Sacs & sandales en cuir" },
          { key: "articles-cuir", label: "Autres articles en cuir" },
        ],
      },
      {
        key: "bijoux-artisanaux",
        label: "Bijoux artisanaux",
        leaves: [
          { key: "bijoux-fait-main", label: "Bijoux faits main" },
          { key: "bijoux-perles", label: "Bijoux en perles & filigrane" },
        ],
      },
      {
        key: "poterie-vannerie",
        label: "Poterie, bois & vannerie",
        leaves: [
          { key: "poterie", label: "Poterie & céramique" },
          { key: "sculpture-bois", label: "Sculpture sur bois" },
          { key: "vannerie", label: "Vannerie" },
        ],
      },
      {
        key: "textile-artisanal",
        label: "Textile artisanal",
        leaves: [
          { key: "teinture-tissage", label: "Teinture & tissage traditionnel" },
          { key: "pagne-tisse", label: "Pagne tissé & Manjak" },
        ],
      },
    ],
  },
  {
    industryKey: "hotel",
    label: "Hôtellerie",
    icon: BedDouble,
    subCategories: [
      {
        key: "hebergement",
        label: "Hébergement",
        leaves: [
          { key: "hotels", label: "Hôtels" },
          { key: "auberges", label: "Auberges & résidences" },
          { key: "airbnb", label: "Appartements meublés" },
        ],
      },
      {
        key: "services-hotel",
        label: "Services",
        leaves: [
          { key: "restauration-hotel", label: "Restauration hôtelière" },
          { key: "piscine-loisirs", label: "Piscine & loisirs" },
        ],
      },
    ],
  },
  {
    industryKey: "travel",
    label: "Agence de voyage",
    icon: Plane,
    subCategories: [
      {
        key: "voyages",
        label: "Voyages",
        leaves: [
          { key: "sejours", label: "Séjours & forfaits" },
          { key: "billets-avion", label: "Billets d'avion" },
          { key: "omra-pelerinage", label: "Omra & pèlerinage" },
        ],
      },
      {
        key: "excursions",
        label: "Excursions",
        leaves: [
          { key: "excursions-locales", label: "Excursions locales" },
          { key: "transport-touristique", label: "Transport touristique" },
        ],
      },
    ],
  },
];
