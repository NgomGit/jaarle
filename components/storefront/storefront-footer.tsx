import Link from "next/link";

/** Pied de boutique : mention Jaarle + lien d'inscription (boucle d'acquisition). */
export function StorefrontFooter() {
  return (
    <footer className="mt-12 border-t border-border py-6 text-center text-xs text-muted-foreground">
      Boutique créée avec{" "}
      <Link href="/?ref=boutique" className="font-semibold text-foreground">
        Jaarle
      </Link>
      {" · "}
      <Link href="/register?ref=boutique" className="font-medium text-primary">
        Crée ta boutique gratuitement
      </Link>
    </footer>
  );
}
