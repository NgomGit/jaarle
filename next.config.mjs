/** @type {import('next').NextConfig} */
const nextConfig = {
  // Sans ça, le Router Cache du client garde une page dynamique (ex: /dashboard/creations)
  // en cache 30s par défaut — après une génération, revenir sur "Mes créations" peut donc
  // afficher un instantané pris avant l'insertion en base, jusqu'à un rechargement complet.
  // On désactive ce cache pour les pages dynamiques : elles refetchent toujours à la navigation.
  experimental: {
    staleTimes: { dynamic: 0 },
    // Studio Marketing : les polices Inter (public/fonts) sont lues par la fonction serverless
    // qui rend les visuels — on s'assure qu'elles sont embarquées dans son bundle au déploiement.
    outputFileTracingIncludes: {
      "/api/studio/visual/[id]": ["./public/fonts/**/*", "./public/images/logo-icon.png"],
      "/api/creations/[id]/preview": ["./public/fonts/**/*", "./public/images/logo-icon.png"],
      "/api/shop-qr": ["./public/fonts/**/*", "./public/images/logo-icon.png"],
      "/opengraph-image": ["./public/fonts/**/*", "./public/images/logo-icon-96.png", "./public/images/premium-examples/*-600.webp"],
      "/market/**/opengraph-image": ["./public/fonts/**/*", "./public/images/logo-icon-96.png"],
      "/market/opengraph-image": ["./public/fonts/**/*", "./public/images/logo-icon-96.png"],
      "/recu/[code]/opengraph-image": ["./public/fonts/**/*", "./public/images/logo-icon-96.png"],
    },
  },
  // PWA : le service worker ne doit jamais être servi depuis un cache HTTP, sinon les vendeurs
  // resteraient sur une ancienne version après un déploiement.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};
export default nextConfig;
