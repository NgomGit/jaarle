import { cn } from "@/lib/utils";

// Badge « WhatsApp vérifié par Jaarle » (migration 0049 : shops.whatsapp_verified_at).
// Sceau festonné aux couleurs Jaarle, posé à côté du nom de la boutique. Volontairement
// indépendant du thème de la boutique : c'est Jaarle qui certifie, pas le vendeur.
// Couleur pleine (pas de dégradé) : un id SVG répété plusieurs fois sur la page casserait le rendu.

const LABEL = "WhatsApp vérifié par Jaarle";

/** Sceau seul (icône). `className` règle la taille (ex. h-5 w-5). */
export function VerifiedSeal({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-5 w-5 shrink-0", className)} aria-hidden focusable="false">
      {/* Sceau à 8 festons */}
      <path
        fill="#4F43E0"
        d="M12 1.6l2.2 1.6 2.7-.3 1.1 2.5 2.5 1.1-.3 2.7 1.6 2.2-1.6 2.2.3 2.7-2.5 1.1-1.1 2.5-2.7-.3L12 22.4l-2.2-1.6-2.7.3-1.1-2.5-2.5-1.1.3-2.7L2.2 12l1.6-2.2-.3-2.7 2.5-1.1 1.1-2.5 2.7.3z"
      />
      <path d="M7.9 12.3l2.6 2.6 5.6-5.7" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Sceau avec libellé accessible (lecteurs d'écran + infobulle au survol). */
export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 align-middle", className)} title={LABEL}>
      <VerifiedSeal className="h-full w-full" />
      <span className="sr-only">{LABEL}</span>
    </span>
  );
}

/** Pastille « WhatsApp vérifié » (rangée d'infos de la vitrine). */
export function VerifiedChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#EEECFD] px-3 py-1.5 text-xs font-semibold text-[#3F34C4] ring-1 ring-[#3F34C4]/15",
        className
      )}
      title={LABEL}
    >
      <VerifiedSeal className="h-4 w-4" />
      WhatsApp vérifié
    </span>
  );
}
