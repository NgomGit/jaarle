// Conditions générales d'utilisation de Jaarle (page /conditions).
// Changer le texte de façon importante → changer TERMS_VERSION : la version acceptée est gardée
// à l'inscription (métadonnées du compte) et à la création de boutique (shops.terms_version, 0045).

export const TERMS_VERSION = "2026-10-08";
export const TERMS_UPDATED_LABEL = "8 octobre 2026";
export const TERMS_PATH = "/conditions";
export const SUPPORT_WHATSAPP = "+221 77 135 02 03";

export type TermsSection = { id: string; title: string; paragraphs?: string[]; bullets?: string[]; after?: string[] };

export const TERMS_SECTIONS: TermsSection[] = [
  {
    id: "objet",
    title: "1. Objet",
    paragraphs: [
      "Jaarle (jaarle.com) aide les commerçants et prestataires à créer leur boutique en ligne, à publier leurs produits et services, à créer des affiches et vidéos avec l'intelligence artificielle, et à être visibles sur Jaarle Market.",
      "Ces conditions s'appliquent à toute personne qui crée un compte, ouvre une boutique ou utilise Jaarle. En cochant la case prévue à l'inscription ou à la création d'une boutique, tu acceptes ces conditions.",
    ],
  },
  {
    id: "compte",
    title: "2. Ton compte",
    bullets: [
      "Tu donnes des informations exactes : ton nom, ton numéro de téléphone et ton numéro WhatsApp.",
      "Un compte correspond à une personne ou à une entreprise, avec une seule boutique.",
      "Tu gardes ton mot de passe secret. Tout ce qui est fait depuis ton compte est sous ta responsabilité.",
      "Tu dois avoir l'âge légal pour vendre, ou l'accord de ton représentant légal.",
    ],
  },
  {
    id: "boutique",
    title: "3. Ta boutique et tes annonces",
    bullets: [
      "Tu es seul responsable de ce que tu publies : photos, noms, descriptions, prix, disponibilité.",
      "Tes annonces doivent être honnêtes : le produit montré est celui que tu vends, au prix affiché.",
      "Les ventes se concluent directement entre toi et l'acheteur (WhatsApp, appel, rencontre). Jaarle n'est pas partie à la vente : le paiement, la livraison, les retours et les garanties sont de ta responsabilité.",
      "Tu dois avoir le droit d'utiliser les photos, logos et textes que tu publies.",
      "Ta boutique et tes produits publiés peuvent apparaître sur Jaarle Market, dans l'annuaire des boutiques et dans la promotion de Jaarle.",
    ],
  },
  {
    id: "interdit",
    title: "4. Ce qui est interdit",
    paragraphs: ["Il est interdit de publier ou de vendre sur Jaarle :"],
    bullets: [
      "des produits illégaux au Sénégal : drogues, armes, munitions, produits volés, faux documents ;",
      "des médicaments ou produits de santé vendus sans autorisation ;",
      "des contrefaçons ou des produits qui utilisent la marque d'autrui sans droit ;",
      "du contenu sexuel, violent, haineux, discriminatoire ou choquant ;",
      "des annonces trompeuses, des arnaques, des faux prix ou des produits que tu n'as pas ;",
      "les photos, le nom ou les données personnelles d'une autre personne sans son accord ;",
      "l'usurpation de l'identité d'une personne, d'une boutique ou d'une entreprise ;",
      "le spam, ou toute tentative de contourner les limites, les crédits ou la sécurité de Jaarle.",
    ],
  },
  {
    id: "ia",
    title: "5. Affiches et vidéos créées avec l'IA",
    bullets: [
      "Les affiches, textes et vidéos sont créés par l'IA à partir de ce que tu fournis. Relis-les avant de les publier : tu es responsable de ce que tu diffuses.",
      "Tu peux utiliser librement les visuels créés pour ta boutique, sur Jaarle et ailleurs (WhatsApp, réseaux sociaux, impression).",
      "Jaarle peut montrer des exemples de créations publiques dans sa vitrine et sa promotion. Tu peux demander le retrait d'une création sur WhatsApp.",
    ],
  },
  {
    id: "offres",
    title: "6. Offres, crédits et abonnements",
    bullets: [
      "Jaarle propose une offre gratuite et des offres payantes (abonnement Pro, packs de crédits). Les prix sont affichés sur la page Tarifs.",
      "Les paiements se font par Wave ou Orange Money via notre prestataire de paiement.",
      "Les crédits et abonnements payés ne sont pas remboursables, sauf erreur technique de notre part (par exemple une génération échouée : le crédit est rendu).",
      "Jaarle peut faire évoluer ses offres et fonctionnalités. Un abonnement en cours garde ses avantages jusqu'à sa fin.",
    ],
  },
  {
    id: "sanctions",
    title: "7. Modération, suspension et bannissement",
    paragraphs: [
      "Pour protéger les acheteurs et les autres vendeurs, Jaarle vérifie les boutiques et les annonces, notamment après un signalement. Si tu ne respectes pas ces conditions, Jaarle peut, selon la gravité :",
    ],
    bullets: [
      "masquer un produit ou une annonce ;",
      "retirer ta boutique de Jaarle Market et de l'annuaire ;",
      "suspendre ta boutique (elle n'est plus visible en ligne) ;",
      "bannir ton compte : tu ne peux plus te connecter ni utiliser Jaarle, et ta boutique est retirée définitivement.",
    ],
    after: [
      "Nous te prévenons en général sur WhatsApp avec la raison, et tu peux corriger ton annonce. En cas de faute grave (arnaque, produit illégal, contenu choquant, récidive), le bannissement peut être immédiat et sans avertissement.",
      "Un compte banni pour non-respect de ces conditions n'a droit à aucun remboursement des crédits ou de l'abonnement restants. Il est interdit de créer un nouveau compte pour contourner un bannissement.",
      `Pour contester une décision, écris-nous sur WhatsApp au ${SUPPORT_WHATSAPP}.`,
    ],
  },
  {
    id: "donnees",
    title: "8. Tes données personnelles",
    bullets: [
      "Nous gardons les informations nécessaires au service : nom, numéros de téléphone et WhatsApp, informations de ta boutique et de tes produits, et des statistiques de visites anonymes.",
      "Ton numéro WhatsApp est affiché sur ta boutique pour que les acheteurs puissent te contacter.",
      "Nous ne vendons pas tes données. Elles sont utilisées pour faire fonctionner Jaarle, te contacter au sujet de ton compte et améliorer le service.",
      "Conformément à la loi sénégalaise n° 2008-12 sur la protection des données personnelles, tu peux demander à consulter, corriger ou supprimer tes données en nous écrivant sur WhatsApp.",
    ],
  },
  {
    id: "responsabilite",
    title: "9. Responsabilité",
    bullets: [
      "Jaarle fait de son mieux pour que le service fonctionne bien, mais ne peut garantir qu'il soit disponible sans interruption ni erreur.",
      "Jaarle n'est pas responsable des ventes, des paiements, des livraisons ou des litiges entre vendeurs et acheteurs.",
    ],
  },
  {
    id: "modifications",
    title: "10. Modification des conditions",
    paragraphs: [
      "Jaarle peut modifier ces conditions. La date de mise à jour est indiquée en haut de cette page. En cas de changement important, nous te prévenons dans ton espace ou sur WhatsApp. Continuer à utiliser Jaarle après un changement vaut acceptation.",
    ],
  },
  {
    id: "droit",
    title: "11. Droit applicable",
    paragraphs: [
      "Ces conditions sont soumises au droit sénégalais. En cas de désaccord, nous cherchons d'abord une solution à l'amiable ; à défaut, les tribunaux de Dakar sont compétents.",
    ],
  },
];
