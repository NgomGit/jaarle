// Types de notifications (partagés client / serveur — garder synchronisé avec la contrainte
// notification_preferences_type_check de la migration 0033).

export type NotificationType = "order" | "payment" | "market" | "test";

export const NOTIFICATION_TYPES: { type: Exclude<NotificationType, "test">; label: string; hint: string }[] = [
  { type: "order", label: "Commandes", hint: "Quand un client t'envoie son panier sur WhatsApp." },
  { type: "payment", label: "Paiements", hint: "Quand ton paiement Jaarle est confirmé (offre, crédits, affiche)." },
  { type: "market", label: "Jaarle Market", hint: "Quand Jaarle met une de tes annonces sur le Market." },
];
