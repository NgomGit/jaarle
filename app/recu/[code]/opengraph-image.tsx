import { notFound } from "next/navigation";
import { OG_SIZE } from "@/lib/market/og";
import { orderOgImage } from "@/lib/shops/order-og";
import { getOrder } from "@/lib/shops/orders";

export const runtime = "nodejs";
export const revalidate = 86400; // une commande ne change plus
export const alt = "Récapitulatif de commande";
export const size = OG_SIZE;
export const contentType = "image/jpeg";

export default async function Image({ params }: { params: { code: string } }) {
  const order = await getOrder(params.code.toUpperCase());
  if (!order) notFound();
  return orderOgImage(order);
}
