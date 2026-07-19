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
} from "lucide-react";

// Arborescence de navigation (catégorie > sous-catégorie > feuille) pour le sélecteur de secteur.
// Purement une aide de navigation/recherche : la valeur réellement stockée et envoyée à l'IA
// reste `industryKey`, l'une des clés de lib/knowledge/industries.ts — la spécificité choisie
// par l'utilisateur (ex: "Robes") ne crée pas de nouvelle branche de contexte IA, elle aide juste
// à retrouver rapidement le bon secteur parmi une liste plus riche.

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
        key: "vetements",
        label: "Vêtements",
        leaves: [
          { key: "robes", label: "Robes" },
          { key: "ensembles-homme", label: "Ensembles homme" },
          { key: "enfant", label: "Vêtements enfant" },
        ],
      },
      {
        key: "chaussures",
        label: "Chaussures",
        leaves: [
          { key: "sneakers", label: "Sneakers" },
          { key: "sandales", label: "Sandales & chaussures traditionnelles" },
        ],
      },
      {
        key: "accessoires-mode",
        label: "Accessoires",
        leaves: [
          { key: "sacs", label: "Sacs" },
          { key: "bijoux", label: "Bijoux & montres" },
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
        ],
      },
      {
        key: "maquillage",
        label: "Maquillage",
        leaves: [
          { key: "teint-levres", label: "Rouge à lèvres & teint" },
          { key: "palettes", label: "Palettes & accessoires" },
        ],
      },
      {
        key: "cheveux",
        label: "Cheveux",
        leaves: [
          { key: "perruques", label: "Perruques & tissages" },
          { key: "produits-capillaires", label: "Produits capillaires" },
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
          { key: "plats-traditionnels", label: "Plats traditionnels" },
          { key: "fast-food", label: "Fast-food & snacking" },
        ],
      },
      {
        key: "patisserie",
        label: "Pâtisserie",
        leaves: [
          { key: "gateaux", label: "Gâteaux & desserts" },
          { key: "boulangerie", label: "Boulangerie" },
        ],
      },
      {
        key: "boissons-resto",
        label: "Boissons",
        leaves: [{ key: "jus-locaux", label: "Jus & boissons locales" }],
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
          { key: "accessoires-tel", label: "Accessoires téléphone" },
        ],
      },
      {
        key: "informatique",
        label: "Informatique",
        leaves: [
          { key: "ordinateurs", label: "Ordinateurs" },
          { key: "accessoires-info", label: "Accessoires informatiques" },
        ],
      },
      {
        key: "electromenager",
        label: "Électroménager",
        leaves: [
          { key: "petit-electromenager", label: "Petit électroménager" },
          { key: "gros-electromenager", label: "Gros électroménager" },
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
        ],
      },
      {
        key: "decoration",
        label: "Décoration",
        leaves: [
          { key: "objets-deco", label: "Objets déco" },
          { key: "luminaires", label: "Luminaires" },
        ],
      },
      {
        key: "textile-maison",
        label: "Textile maison",
        leaves: [{ key: "rideaux-tapis", label: "Rideaux & tapis" }],
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
        ],
      },
      {
        key: "location-immo",
        label: "Location",
        leaves: [
          { key: "appartements-location", label: "Appartements à louer" },
          { key: "chambres-studios", label: "Chambres & studios" },
        ],
      },
      {
        key: "terrains",
        label: "Terrains",
        leaves: [{ key: "terrains-vente", label: "Terrains à vendre" }],
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
        ],
      },
      {
        key: "pieces-auto",
        label: "Pièces & accessoires",
        leaves: [
          { key: "pieces-detachees", label: "Pièces détachées" },
          { key: "accessoires-auto", label: "Accessoires auto" },
        ],
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
          { key: "produits-base", label: "Produits de base" },
          { key: "epices", label: "Épices & condiments" },
        ],
      },
      {
        key: "frais",
        label: "Frais",
        leaves: [{ key: "fruits-legumes", label: "Fruits & légumes" }],
      },
      {
        key: "boissons-epicerie",
        label: "Boissons",
        leaves: [{ key: "boissons-eau", label: "Boissons & eau" }],
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
        ],
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
        ],
      },
      {
        key: "anniversaire",
        label: "Anniversaire",
        leaves: [{ key: "organisation-anniversaire", label: "Organisation anniversaire" }],
      },
      {
        key: "corporate",
        label: "Corporate",
        leaves: [{ key: "evenements-entreprise", label: "Événements d'entreprise" }],
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
        ],
      },
      {
        key: "services-hotel",
        label: "Services",
        leaves: [{ key: "restauration-hotel", label: "Restauration hôtelière" }],
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
