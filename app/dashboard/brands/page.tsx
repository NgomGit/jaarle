import { redirect } from "next/navigation";

// L'ancien placeholder « Marques » (écran « Bientôt ») est remplacé par la boutique Jaarle 2.0,
// qui porte désormais l'identité de marque (nom, logo, activité, contact). Redirection conservée
// pour ne casser aucun ancien lien.
export default function BrandsPage() {
  redirect("/dashboard/boutique");
}
