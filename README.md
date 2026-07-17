# Affisse — Frontend

Next.js 14 (App Router) + TypeScript + Tailwind + composants façon shadcn/ui, dans la direction visuelle "Linear/Notion" (fond clair, accent violet/bleu) validée pour le projet.

## Installation

```bash
npm install
cp .env.example .env.local   # renseigner ensuite tes clés Supabase
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000).

## Structure

```
app/
  layout.tsx        → polices, ThemeProvider (dark/light), LocaleProvider (FR/EN)
  page.tsx           → assemble toutes les sections de la landing
  globals.css         → tokens de couleur en variables HSL (light + dark)
components/
  ui/                 → primitives façon shadcn (button, card, badge, input, tabs)
  site/               → sections (navbar, hero, pricing, dashboard-preview, etc.)
  theme-provider.tsx / theme-toggle.tsx   → dark/light via next-themes
  language-toggle.tsx                       → sélecteur FR/EN
  logo.tsx                                  → le mark géométrique (SVG, pas d'image)
lib/
  dictionaries/fr.json, en.json   → tous les textes de l'interface
  locale-context.tsx               → contexte React pour le FR/EN (persisté en localStorage)
  supabase/client.ts               → client Supabase pour composants "use client"
  supabase/server.ts               → client Supabase pour Server Components
```

## Icônes

Toutes les icônes viennent de **lucide-react** (outline, `strokeWidth={1.75}` par défaut dans les composants) — aucun émoji dans l'interface.

## Dark / light mode

Géré par `next-themes`. Le bouton se trouve dans la navbar (`ThemeToggle`). Les couleurs sont définies une seule fois dans `app/globals.css` sous forme de variables CSS (`:root` pour le clair, `.dark` pour le sombre) et consommées partout via Tailwind (`bg-background`, `text-foreground`, etc.) — aucune couleur n'est codée en dur dans les composants.

## Français / Anglais

Solution volontairement simple pour ce MVP : un `LocaleProvider` (contexte React) lit un dictionnaire JSON (`fr.json` / `en.json`) et expose une fonction `t("chemin.vers.la.clé")`. Le choix de langue est mémorisé dans `localStorage`.

**Limite connue** : ce n'est pas du routing par locale (`/fr/...`, `/en/...`), donc pas idéal pour le SEO multilingue. Si le SEO international devient prioritaire, migrer vers le [routing i18n natif de Next.js](https://nextjs.org/docs/app/building-your-application/routing/internationalization) ou vers `next-intl` — la structure des dictionnaires JSON est déjà compatible avec cette migration.

## Connexion Supabase

Les deux clients sont prêts (`lib/supabase/client.ts` pour le navigateur, `lib/supabase/server.ts` pour le serveur). Il ne reste qu'à :
1. Renseigner `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` dans `.env.local`
2. Brancher l'auth par téléphone (OTP) sur l'écran d'upload
3. Remplacer les données statiques du dashboard (`components/site/dashboard-preview.tsx`) par une requête Supabase réelle sur la table des créations

## Ce qui reste à construire

- Authentification (écran de connexion par téléphone/OTP)
- Vraie logique d'upload vers Supabase Storage
- Page de gestion de l'identité de marque (logo, couleurs, ton)
- Historique complet des créations avec pagination
- Connexion réelle aux liens de paiement Wave (le dashboard affiche pour l'instant des données de démonstration)
