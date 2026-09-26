import { redirect } from "next/navigation";

// « Mes créations » est désormais le Studio. L'ancienne adresse reste valable (liens existants,
// retour d'annulation PayTech `?canceled=1`, favoris) et redirige en conservant le paramètre.
export default function CreationsPage({ searchParams }: { searchParams: { canceled?: string } }) {
  redirect(searchParams.canceled ? "/dashboard/studio?canceled=1" : "/dashboard/studio");
}
