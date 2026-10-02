"use client";

import * as React from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";

// Meta Pixel (Facebook / Instagram Ads). Code fourni par Meta, chargé après l'affichage de la page
// (afterInteractive) pour ne pas ralentir le site. Le PageView initial est envoyé par le code de
// Meta ; les navigations internes de Next.js (sans rechargement) envoient leur propre PageView.
// Désactivé si NEXT_PUBLIC_META_PIXEL_ID vaut « off ».
// La balise <noscript> de Meta n'est pas reprise : rendue par React, son image se chargeait aussi
// avec JavaScript actif et comptait chaque visite deux fois.

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "1618212289965356";
const ENABLED = PIXEL_ID !== "off" && /^\d+$/.test(PIXEL_ID);

type Fbq = (...args: unknown[]) => void;

function RouteChangeTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const first = React.useRef(true);
  React.useEffect(() => {
    // Le premier affichage est déjà compté par le code de Meta.
    if (first.current) {
      first.current = false;
      return;
    }
    (window as unknown as { fbq?: Fbq }).fbq?.("track", "PageView");
  }, [pathname, searchParams]);
  return null;
}

export function MetaPixel() {
  if (!ENABLED) return null;
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL_ID}');fbq('track','PageView');`}
      </Script>
      <React.Suspense fallback={null}>
        <RouteChangeTracker />
      </React.Suspense>
    </>
  );
}

/** Événement Meta (ex. « CompleteRegistration ») ; sans effet si le pixel n'est pas chargé. */
export function trackMetaEvent(event: string, params?: Record<string, unknown>) {
  try {
    (window as unknown as { fbq?: Fbq }).fbq?.("track", event, params);
  } catch {
    // le suivi ne doit jamais gêner l'utilisateur
  }
}
