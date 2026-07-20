/** @type {import('next').NextConfig} */
const nextConfig = {
  // Sans ça, le Router Cache du client garde une page dynamique (ex: /dashboard/creations)
  // en cache 30s par défaut — après une génération, revenir sur "Mes créations" peut donc
  // afficher un instantané pris avant l'insertion en base, jusqu'à un rechargement complet.
  // On désactive ce cache pour les pages dynamiques : elles refetchent toujours à la navigation.
  experimental: {
    staleTimes: { dynamic: 0 },
  },
};
export default nextConfig;
