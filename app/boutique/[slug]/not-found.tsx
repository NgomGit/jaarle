import Link from "next/link";

export default function ShopNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="mb-2 text-xl font-bold">Boutique introuvable</h1>
      <p className="mb-6 max-w-sm text-sm text-muted-foreground">
        Ce lien ne correspond à aucune boutique en ligne. Elle a peut-être été mise hors ligne par son propriétaire.
      </p>
      <Link href="/register?ref=boutique" className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background">
        Créer ma boutique sur Jaarle
      </Link>
    </main>
  );
}
