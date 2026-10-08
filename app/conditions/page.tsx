import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { SUPPORT_WHATSAPP, TERMS_SECTIONS, TERMS_UPDATED_LABEL } from "@/lib/legal/terms";
import { absoluteUrl } from "@/lib/seo";

const TITLE = "Conditions générales d'utilisation";

export const metadata: Metadata = {
  title: TITLE,
  description: "Les règles d'utilisation de Jaarle : compte, boutique, annonces, contenus interdits, crédits, modération et bannissement, données personnelles.",
  alternates: { canonical: absoluteUrl("/conditions") },
};

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main className="container max-w-3xl py-10 sm:py-14">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{TITLE}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Mise à jour le {TERMS_UPDATED_LABEL}</p>

        <p className="mt-6 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm leading-6">
          <strong>En résumé :</strong> tu es responsable de ta boutique et de tes annonces. Les produits illégaux, les arnaques, les contrefaçons et les
          contenus choquants sont interdits. Un compte qui ne respecte pas ces conditions peut être suspendu ou <strong>banni</strong>.
        </p>

        <nav aria-label="Sommaire" className="mt-8 rounded-2xl bg-muted/50 p-4 text-sm">
          <ol className="grid gap-1 sm:grid-cols-2">
            {TERMS_SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-muted-foreground hover:text-foreground hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-8 space-y-9">
          {TERMS_SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="text-lg font-semibold">{s.title}</h2>
              {s.paragraphs?.map((p, i) => (
                <p key={i} className="mt-3 text-[15px] leading-7 text-foreground/90">
                  {p}
                </p>
              ))}
              {s.bullets && (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-7 text-foreground/90">
                  {s.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
              {s.after?.map((p, i) => (
                <p key={i} className="mt-3 text-[15px] leading-7 text-foreground/90">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>

        <p className="mt-12 text-sm text-muted-foreground">
          Une question ? Écris-nous sur{" "}
          <a href="https://wa.me/221771350203" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
            WhatsApp ({SUPPORT_WHATSAPP})
          </a>
          . <Link href="/register" className="font-semibold text-primary hover:underline">Créer mon compte</Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
