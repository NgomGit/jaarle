import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Button } from "@/components/ui/button";
import { getLanding, type Landing } from "@/lib/landings";
import { absoluteUrl, breadcrumbLd, faqLd, jsonLdString } from "@/lib/seo";

// Gabarit des pages d'atterrissage SEO (contenu dans lib/landings.ts). Rendu serveur, en français :
// tout le texte est dans le HTML envoyé à Google (pas de traduction côté client ici).

export function landingMetadata(slug: string): Metadata {
  const l = getLanding(slug);
  const url = absoluteUrl(`/${l.slug}`);
  return {
    title: l.title,
    description: l.description,
    keywords: l.keywords,
    alternates: { canonical: url },
    openGraph: { title: l.title, description: l.description, url, siteName: "Jaarle", locale: "fr_SN", type: "website" },
    twitter: { card: "summary_large_image", title: l.title, description: l.description },
  };
}

export function LandingPage({ landing: l, children }: { landing: Landing; children?: React.ReactNode }) {
  const url = absoluteUrl(`/${l.slug}`);
  const jsonLd = [
    faqLd(l.faq),
    breadcrumbLd([
      { name: "Jaarle", url: absoluteUrl("/") },
      { name: l.h1, url },
    ]),
  ];
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <Navbar />

      <section className="border-b border-border pb-14 pt-12 sm:pt-20">
        <div className="container max-w-3xl">
          <nav aria-label="Fil d'Ariane" className="mb-6 text-xs text-muted-foreground">
            <Link href="/" className="hover:text-foreground">Jaarle</Link>
            <span className="mx-1.5">/</span>
            <span>{l.kicker}</span>
          </nav>
          <h1 className="mb-4 text-[32px] font-bold leading-[1.1] tracking-tight sm:text-5xl">{l.h1}</h1>
          <p className="mb-7 text-base leading-relaxed text-muted-foreground sm:text-lg">{l.lead}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="accent" size="lg" asChild>
              <Link href={l.primary.href}>{l.primary.label}</Link>
            </Button>
            <Button variant="secondary" size="lg" asChild>
              <Link href={l.secondary.href}>{l.secondary.label}</Link>
            </Button>
          </div>
          <p className="mt-5 text-sm text-muted-foreground">Gratuit pour commencer · Sans carte bancaire · Sans commission</p>
        </div>
      </section>

      <div className="container max-w-3xl space-y-12 py-14">
        {l.sections.map((s) => (
          <section key={s.h2}>
            <h2 className="mb-4 text-2xl font-bold tracking-tight sm:text-3xl">{s.h2}</h2>
            {s.paragraphs?.map((p) => (
              <p key={p} className="mb-3 leading-relaxed text-muted-foreground">{p}</p>
            ))}
            {s.bullets && (
              <ul className="space-y-3">
                {s.bullets.map((b) => (
                  <li key={b} className="flex gap-3 leading-relaxed text-muted-foreground">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-success" aria-hidden />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {children}

        <section>
          <h2 className="mb-5 text-2xl font-bold tracking-tight sm:text-3xl">Questions fréquentes</h2>
          <div className="divide-y divide-border rounded-2xl border border-border">
            {l.faq.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none font-semibold marker:hidden">{f.q}</summary>
                <p className="mt-2 leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="rounded-[22px] bg-foreground px-6 py-10 text-center sm:px-10">
          <h2 className="mb-3 text-2xl font-bold text-background sm:text-3xl">Ta boutique peut être en ligne ce soir.</h2>
          <p className="mx-auto mb-6 max-w-md text-[15px] text-background/65">
            Crée-la gratuitement, ajoute tes produits et partage ton lien sur WhatsApp.
          </p>
          <Button variant="accent" size="lg" asChild>
            <Link href="/register">Créer ma boutique gratuitement</Link>
          </Button>
        </section>

        <nav aria-label="À lire aussi">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">À lire aussi</h2>
          <ul className="flex flex-wrap gap-2">
            {l.links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="inline-block rounded-full border border-border px-4 py-2 text-sm hover:bg-accent">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <Footer />
    </main>
  );
}
