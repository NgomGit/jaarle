// Codes commerciaux et expressions courantes du e-commerce sénégalais.
// Sert à ce que le texte généré sonne comme un vrai commerçant local, pas une pub générique.

export const paymentPhrasesFr = [
  "Paiement par Wave ou Orange Money",
  "Livraison contre paiement (cash à la livraison)",
  "Paiement à la livraison disponible",
];

export const deliveryPhrasesFr = [
  "Livraison rapide à Dakar",
  "Livraison disponible partout au Sénégal",
  "Livraison dans toute la région",
];

export const orderingPhrasesFr = [
  "Commande directement sur WhatsApp",
  "Écris-nous sur WhatsApp pour commander",
  "DM ou WhatsApp pour commander",
];

export const urgencyPhrasesFr = [
  "Stock limité",
  "Commande vite avant rupture de stock",
  "Disponible en quantité limitée",
];

export const businessPracticesNote = `Codes commerciaux locaux à intégrer naturellement quand pertinent (ne pas tous utiliser à chaque fois, choisir ce qui convient) :
- Paiement : ${paymentPhrasesFr.join(" / ")}
- Livraison : ${deliveryPhrasesFr.join(" / ")}
- Commande : ${orderingPhrasesFr.join(" / ")}
- Urgence : ${urgencyPhrasesFr.join(" / ")}
Le e-commerce au Sénégal passe très majoritairement par WhatsApp et Facebook — le texte doit donner envie d'écrire directement au vendeur, pas de "visiter un site".`;
