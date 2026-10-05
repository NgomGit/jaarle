// Pages d'atterrissage SEO / Google Ads (une page par intention de recherche).
// Le contenu est ici, le rendu dans components/site/landing-page.tsx, les routes dans app/<slug>/page.tsx.
// Rester factuel : ne rien promettre que l'app ne fait pas (durées, chiffres, visibilité Market
// = offerte pendant le lancement puis incluse dans Pro).

export interface LandingSection {
  h2: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LandingLink {
  href: string;
  label: string;
}

export interface Landing {
  slug: string;
  /** <title> (le gabarit ajoute « | Jaarle »). ~60 caractères max. */
  title: string;
  /** Meta description, ~155 caractères. */
  description: string;
  keywords: string[];
  kicker: string;
  h1: string;
  lead: string;
  primary: LandingLink;
  secondary: LandingLink;
  sections: LandingSection[];
  faq: { q: string; a: string }[];
  /** Liens internes affichés en bas de page (maillage). */
  links: LandingLink[];
}

export const LANDINGS: Landing[] = [
  {
    slug: "creer-boutique-en-ligne-senegal",
    title: "Créer une boutique en ligne gratuite au Sénégal",
    description:
      "Crée ta boutique en ligne gratuitement au Sénégal, depuis ton téléphone : lien, QR code, prix en FCFA et commandes sur WhatsApp. Sans site, sans commission.",
    keywords: [
      "boutique en ligne Sénégal",
      "créer une boutique en ligne gratuite",
      "créer boutique en ligne Dakar",
      "site e-commerce Sénégal",
      "vendre en ligne au Sénégal",
    ],
    kicker: "Boutique en ligne · Sénégal",
    h1: "Crée ta boutique en ligne gratuitement au Sénégal",
    lead:
      "Pas besoin de site internet ni de développeur. Avec Jaarle, ta boutique en ligne est prête en quelques minutes depuis ton téléphone : tes produits, tes prix en FCFA, et un bouton pour que tes clients t'écrivent sur WhatsApp.",
    primary: { href: "/register", label: "Créer ma boutique gratuitement" },
    secondary: { href: "/boutiques", label: "Voir des boutiques Jaarle" },
    sections: [
      {
        h2: "Une boutique en ligne en 3 étapes",
        bullets: [
          "Crée ta boutique : nom, logo et numéro WhatsApp. Elle a tout de suite son lien jaarle.com/boutique/… et son QR code.",
          "Ajoute tes produits : une photo suffit. Jaarle propose le nom, la description et la catégorie, tu n'as plus qu'à mettre le prix.",
          "Partage et vends : envoie ton lien sur WhatsApp, Instagram, Facebook ou TikTok. Tes clients te contactent directement pour commander.",
        ],
      },
      {
        h2: "Pourquoi les commerçants du Sénégal choisissent Jaarle",
        bullets: [
          "Gratuit pour commencer, sans carte bancaire.",
          "Aucune commission sur tes ventes : le client te paie directement.",
          "Prix en FCFA, commandes sur WhatsApp, abonnement Pro payable par Wave ou Orange Money.",
          "Une vitrine moderne aux couleurs de ton logo, qui rassure tes clients.",
          "Des statistiques simples : visiteurs, clics WhatsApp, appels, produits les plus vus.",
        ],
      },
      {
        h2: "Pour tous les commerces",
        paragraphs: [
          "Mode et tenues africaines, beauté et parfums, électronique, épicerie, produits du terroir, maison et déco, artisanat, auto et moto, restauration et traiteur, immobilier, services : chaque boutique Jaarle s'adapte à ce que tu vends, que tu sois à Dakar, Thiès, Touba, Saint-Louis, Mbour ou ailleurs au Sénégal.",
        ],
      },
      {
        h2: "Plus de visibilité avec Jaarle Market",
        paragraphs: [
          "Tes produits peuvent aussi apparaître sur Jaarle Market, la marketplace des boutiques Jaarle, où les acheteurs cherchent par produit, catégorie et ville. La visibilité sur le Market est offerte pendant le lancement, puis incluse dans l'offre Pro.",
        ],
      },
    ],
    faq: [
      {
        q: "Combien coûte une boutique en ligne avec Jaarle ?",
        a: "La boutique est gratuite pour commencer. L'offre Pro, payable par Wave ou Orange Money, ajoute plus de produits, plus d'affiches et plus de visibilité. Le détail est sur la page Tarifs.",
      },
      {
        q: "Est-ce que j'ai besoin d'un site internet ou d'un nom de domaine ?",
        a: "Non. Ta boutique a son propre lien sur jaarle.com et son QR code, que tu peux partager partout.",
      },
      {
        q: "Comment mes clients paient-ils ?",
        a: "Ils te contactent sur WhatsApp et tu conviens avec eux du paiement et de la livraison, comme tu le fais déjà. Jaarle ne prend aucune commission.",
      },
      {
        q: "Je peux créer ma boutique depuis mon téléphone ?",
        a: "Oui. Jaarle est pensé pour le téléphone et peut même s'installer comme une application.",
      },
    ],
    links: [
      { href: "/vendre-sur-whatsapp", label: "Vendre sur WhatsApp" },
      { href: "/affiche-publicitaire", label: "Créer une affiche publicitaire" },
      { href: "/marketplace-senegal", label: "Jaarle Market, la marketplace du Sénégal" },
      { href: "/tarifs", label: "Tarifs" },
    ],
  },
  {
    slug: "vendre-sur-whatsapp",
    title: "Vendre sur WhatsApp : catalogue, lien et QR code",
    description:
      "Vends sur WhatsApp avec un vrai catalogue en ligne : chaque produit a son bouton WhatsApp, ton lien et ton QR code se partagent partout. Gratuit pour commencer.",
    keywords: [
      "vendre sur WhatsApp",
      "catalogue WhatsApp",
      "boutique WhatsApp",
      "vendre sur WhatsApp Sénégal",
      "statut WhatsApp vente",
    ],
    kicker: "WhatsApp · Catalogue en ligne",
    h1: "Vends sur WhatsApp avec un vrai catalogue en ligne",
    lead:
      "Tes clients sont déjà sur WhatsApp. Jaarle te donne un catalogue en ligne propre, où chaque produit a son bouton « Commander sur WhatsApp » : le client t'écrit avec le produit déjà dans son message.",
    primary: { href: "/register", label: "Créer mon catalogue gratuitement" },
    secondary: { href: "/market", label: "Voir Jaarle Market" },
    sections: [
      {
        h2: "Fini les photos envoyées une par une",
        paragraphs: [
          "Au lieu de renvoyer les mêmes photos et les mêmes prix à chaque client, partage un seul lien. Le client voit tous tes produits, leurs prix en FCFA et leur disponibilité, puis il t'écrit pour commander.",
        ],
      },
      {
        h2: "Ce que Jaarle fait pour tes ventes WhatsApp",
        bullets: [
          "Un bouton WhatsApp, un bouton d'appel et un bouton de partage sur chaque produit.",
          "Un lien de boutique à mettre dans ta bio, ton statut et tes groupes.",
          "Un QR code à imprimer et à afficher dans ta boutique physique.",
          "Des visuels prêts pour ton statut WhatsApp, Instagram, Facebook et TikTok.",
          "Le nombre de clics WhatsApp et d'appels, pour savoir ce qui fait vendre.",
        ],
      },
      {
        h2: "Compatible WhatsApp et WhatsApp Business",
        paragraphs: [
          "Tu gardes ton numéro et ta façon de travailler. Jaarle t'apporte la vitrine, les visuels et des clients qui arrivent avec une demande précise.",
        ],
      },
    ],
    faq: [
      {
        q: "Faut-il WhatsApp Business ?",
        a: "Non. Jaarle marche avec WhatsApp et WhatsApp Business. Tu indiques simplement le numéro sur lequel tu veux recevoir les commandes.",
      },
      {
        q: "Quelle différence avec le catalogue de WhatsApp Business ?",
        a: "Ta boutique Jaarle a son propre lien, s'ouvre sans application, peut être trouvée sur Google et sur Jaarle Market, et Jaarle crée aussi tes affiches et tes publications.",
      },
      {
        q: "Jaarle prend-il une commission ?",
        a: "Non. Le client te contacte et te paie directement.",
      },
    ],
    links: [
      { href: "/creer-boutique-en-ligne-senegal", label: "Créer une boutique en ligne au Sénégal" },
      { href: "/affiche-publicitaire", label: "Créer une affiche publicitaire" },
      { href: "/vendre-ses-services", label: "Proposer ses services en ligne" },
      { href: "/tarifs", label: "Tarifs" },
    ],
  },
  {
    slug: "affiche-publicitaire",
    title: "Affiche publicitaire pour ton produit, créée par l'IA",
    description:
      "Crée une affiche publicitaire professionnelle à partir d'une simple photo : l'IA choisit le style, le décor et les couleurs. Prix en FCFA, prête pour WhatsApp et Instagram.",
    keywords: [
      "affiche publicitaire",
      "créer une affiche publicitaire",
      "affiche produit IA",
      "flyer boutique",
      "visuel Instagram produit",
    ],
    kicker: "Affiches · Publications réseaux",
    h1: "Crée une affiche publicitaire pro à partir d'une simple photo",
    lead:
      "Prends ton produit en photo avec ton téléphone. Jaarle crée une affiche qui donne envie, avec ton prix et ton numéro bien visibles, puis prépare tes publications pour Instagram, Facebook, TikTok et le statut WhatsApp.",
    primary: { href: "/register", label: "Créer ma première affiche" },
    secondary: { href: "/tarifs", label: "Voir les tarifs" },
    sections: [
      {
        h2: "Pas de graphiste, pas de logiciel",
        paragraphs: [
          "Tu n'as pas à choisir de modèle : l'IA analyse ton produit et compose elle-même le décor, la mise en page et les couleurs qui le mettent en valeur. Tu peux utiliser jusqu'à 3 photos : la principale mise en avant, les autres en vignettes.",
        ],
      },
      {
        h2: "Le Studio : tes publications prêtes",
        bullets: [
          "Choisis une affiche et ton objectif : vendre, présenter, promo ou nouveauté.",
          "Jaarle adapte le visuel à chaque format : publication, story, statut WhatsApp.",
          "Il écrit aussi tes légendes, tes hashtags et tes appels à l'action.",
        ],
      },
      {
        h2: "Pour les produits comme pour les services",
        paragraphs: [
          "Vêtements, chaussures, parfums, téléphones, plats, meubles, voitures, mais aussi coiffure, couture, événementiel ou location : chaque affiche est pensée pour ce que tu proposes.",
        ],
      },
    ],
    faq: [
      {
        q: "Combien d'affiches puis-je créer gratuitement ?",
        a: "L'offre gratuite inclut des générations pour essayer. Pro en ajoute beaucoup plus chaque mois, sans le logo Jaarle. Le détail est sur la page Tarifs.",
      },
      {
        q: "Est-ce que mon prix et mon numéro apparaissent sur l'affiche ?",
        a: "Oui. Ton prix en FCFA et ton contact sont vérifiés et bien visibles.",
      },
      {
        q: "Je peux utiliser les affiches ailleurs que sur Jaarle ?",
        a: "Oui. Tu les télécharges et tu les partages sur WhatsApp, Instagram, Facebook, TikTok, ou tu les imprimes.",
      },
    ],
    links: [
      { href: "/creer-boutique-en-ligne-senegal", label: "Créer une boutique en ligne au Sénégal" },
      { href: "/vendre-sur-whatsapp", label: "Vendre sur WhatsApp" },
      { href: "/vendre-ses-services", label: "Proposer ses services en ligne" },
    ],
  },
  {
    slug: "marketplace-senegal",
    title: "Jaarle Market : marketplace et annonces au Sénégal",
    description:
      "Jaarle Market, la marketplace des boutiques du Sénégal : mode, beauté, électronique, auto, immobilier, services. Cherche par catégorie et par ville, commande sur WhatsApp.",
    keywords: [
      "marketplace Sénégal",
      "annonces Sénégal",
      "petites annonces Dakar",
      "acheter en ligne Sénégal",
      "boutiques Dakar",
    ],
    kicker: "Marketplace · Annonces",
    h1: "Jaarle Market, la marketplace des boutiques du Sénégal",
    lead:
      "Trouve des produits et des services proposés par de vraies boutiques sénégalaises. Cherche par catégorie ou par ville, compare les prix en FCFA et contacte le vendeur directement sur WhatsApp.",
    primary: { href: "/market", label: "Explorer Jaarle Market" },
    secondary: { href: "/register", label: "Vendre sur Jaarle Market" },
    sections: [
      {
        h2: "Des annonces de vraies boutiques",
        paragraphs: [
          "Chaque produit du Market appartient à une boutique Jaarle, avec son nom, sa ville et son numéro WhatsApp. Tu vois la boutique entière avant de commander, et tu parles directement au vendeur, sans intermédiaire.",
        ],
      },
      {
        h2: "Tu es vendeur ?",
        bullets: [
          "Crée ta boutique gratuitement et ajoute tes produits avec une photo.",
          "Tes produits apparaissent dans les recherches, les catégories et les pages de ta ville.",
          "La visibilité sur le Market est offerte pendant le lancement, puis incluse dans Pro, avec badge PRO et mise en avant.",
          "Aucune commission : l'acheteur te contacte et te paie directement.",
        ],
      },
    ],
    faq: [
      {
        q: "Comment acheter sur Jaarle Market ?",
        a: "Choisis un produit, puis clique sur le bouton WhatsApp : tu écris directement au vendeur, avec le produit déjà dans ton message. Vous convenez ensemble du paiement et de la livraison.",
      },
      {
        q: "Comment vendre sur Jaarle Market ?",
        a: "Crée une boutique Jaarle gratuitement et ajoute tes produits avec photo. Ils peuvent ensuite apparaître sur le Market.",
      },
      {
        q: "Quelles villes sont couvertes ?",
        a: "Tout le Sénégal : Dakar, Pikine, Guédiawaye, Rufisque, Thiès, Mbour, Touba, Saint-Louis, Kaolack, Ziguinchor et d'autres villes.",
      },
    ],
    links: [
      { href: "/market", label: "Jaarle Market" },
      { href: "/boutiques", label: "Toutes les boutiques" },
      { href: "/creer-boutique-en-ligne-senegal", label: "Créer une boutique en ligne au Sénégal" },
    ],
  },
  {
    slug: "vendre-ses-services",
    title: "Proposer ses services en ligne au Sénégal",
    description:
      "Coiffure, couture, événementiel, traiteur, location, réparation : présente tes services en ligne avec Jaarle, avec tes affiches, tes tarifs en FCFA et tes clients sur WhatsApp.",
    keywords: [
      "services Sénégal",
      "prestataire Dakar",
      "publicité salon de coiffure",
      "affiche services",
      "trouver un artisan Dakar",
    ],
    kicker: "Services · Artisans · Prestataires",
    h1: "Fais connaître tes services en ligne",
    lead:
      "Coiffure, couture, maquillage, événementiel, traiteur, location, réparation ou artisanat : avec Jaarle, tu présentes tes prestations comme une vraie marque, et tes clients te réservent sur WhatsApp.",
    primary: { href: "/register", label: "Créer ma page gratuitement" },
    secondary: { href: "/market/services", label: "Voir les services sur le Market" },
    sections: [
      {
        h2: "Une vitrine pour tes prestations",
        bullets: [
          "Chaque service a sa fiche : photos, description, tarif en FCFA ou « sur devis ».",
          "Un bouton WhatsApp et un bouton d'appel pour réserver en un geste.",
          "Un lien et un QR code à partager avec tes clients.",
        ],
      },
      {
        h2: "Des affiches qui donnent confiance",
        paragraphs: [
          "Jaarle crée des affiches et des publications pour tes services, prêtes pour ton statut WhatsApp, Instagram, Facebook et TikTok. Idéal pour annoncer une promo, une nouvelle prestation ou tes disponibilités.",
        ],
      },
      {
        h2: "Être trouvé par de nouveaux clients",
        paragraphs: [
          "Tes services peuvent apparaître sur Jaarle Market, dans les catégories Services & artisans, Événementiel, Restauration & traiteur ou Immobilier & locations, et dans les pages de ta ville.",
        ],
      },
    ],
    faq: [
      {
        q: "Je n'ai pas de prix fixe, est-ce possible ?",
        a: "Oui. Tu peux afficher « sur devis » : le client t'écrit sur WhatsApp pour avoir ton tarif.",
      },
      {
        q: "Quels services sont acceptés ?",
        a: "La plupart des prestations locales : beauté, couture, événementiel, traiteur, location, réparation, artisanat, immobilier.",
      },
    ],
    links: [
      { href: "/affiche-publicitaire", label: "Créer une affiche publicitaire" },
      { href: "/vendre-sur-whatsapp", label: "Vendre sur WhatsApp" },
      { href: "/marketplace-senegal", label: "Jaarle Market, la marketplace du Sénégal" },
    ],
  },
];

const BY_SLUG = new Map(LANDINGS.map((l) => [l.slug, l]));

export function getLanding(slug: string): Landing {
  const l = BY_SLUG.get(slug);
  if (!l) throw new Error(`Landing inconnue : ${slug}`);
  return l;
}
