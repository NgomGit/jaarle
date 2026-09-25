# Jaarle 2.0 — Plan technique d'implémentation

_Rédigé le 2026-09-25 à partir du code de `affisse-front` (commit `cd5230f`). Couvre les phases 0 → 10
du cadrage ; seules les phases 0 et 1 sont implémentées dans cette itération._

Règle d'or : **on ajoute à côté, on ne modifie pas au milieu.** Le générateur d'affiches
(`/api/generate-creation`, `/api/regenerate-creation`, `/api/creations/*`, `lib/poster-pipeline.ts`,
PayTech) garde exactement son comportement.

---

## 1. Fichiers à créer

| Fichier | Phase | Rôle |
| --- | --- | --- |
| `supabase/migrations/0015_shops_products.sql` | 0 | Tables `shops`, `products`, `product_images`, `shop_events`, colonnes `creations.shop_id/product_id/format`, RLS, triggers, fonction `is_shop_slug_available` |
| `supabase/migrations/0016_shop_media_bucket.sql` | 0 | Bucket public `shop-media` + policies storage |
| `supabase/tests/rls_shops.sql` | 0 | Script de vérification RLS (à lancer sur une base de test) |
| `lib/shops/types.ts` | 0 | Types `Shop`, `Product`, `ProductImage`, `ShopStatus`… |
| `lib/shops/slug.ts` | 0 | `slugify`, mots réservés, validation (partagé client/serveur) |
| `lib/shops/schema.ts` | 1 | Schémas zod des formulaires boutique |
| `lib/shops/queries.ts` | 1 | Lecture serveur : `getMyShop`, `getShopMediaUrl` |
| `lib/shops/context.ts` | 0 | `buildShopContext(shop, product?)` — contexte de marque pour les futurs prompts (non branché) |
| `lib/shops/cities.ts` | 1 | Villes proposées (Dakar, Thiès, Touba…) |
| `lib/formats.ts` | 0 | Dimensions `square` / `story` / `landscape` (référence ; le pipeline n'est pas encore modifié) |
| `lib/client-image.ts` | 1 | Réduction côté navigateur avant upload (données mobiles + limite 4,5 Mo de Vercel) |
| `app/api/shop-media/upload/route.ts` | 1 | Upload d'image → sharp (WebP, taille max) → bucket `shop-media` |
| `app/dashboard/boutique/page.tsx` | 1 | Page « Ma boutique » : onboarding si aucune boutique, sinon aperçu |
| `app/dashboard/boutique/actions.ts` | 1 | Server actions : `createShop`, `updateShop`, `checkSlug` |
| `app/dashboard/boutique/modifier/page.tsx` | 1 | Formulaire d'édition |
| `components/shop/shop-onboarding.tsx` | 1 | Parcours 3 écrans mobile-first |
| `components/shop/shop-overview.tsx` | 1 | Carte boutique : lien, copie, statut, prochaines étapes |
| `components/shop/shop-form-fields.tsx` | 1 | Champs partagés (nom, activité, WhatsApp, ville, logo…) |
| `components/shop/logo-picker.tsx` | 1 | Choix / aperçu / retrait du logo |
| `components/dashboard/shop-banner.tsx` | 1 | Encart « Crée ta boutique » sur l'accueil |
| Phases 2+ | | `app/dashboard/produits/*`, `app/api/products/analyze`, `app/boutique/[slug]/*`, `app/r/wa/*`, `app/q/*`, `app/api/track`, `lib/shops/poster-adapter.ts` |

## 2. Fichiers modifiés (modifications minimales)

| Fichier | Modification |
| --- | --- |
| `middleware.ts` | `matcher` : exclure `/boutique`, `/r/`, `/q/` (pages publiques sans session, cachables) |
| `components/dashboard/dashboard-shell.tsx` | Entrée de menu « Marques » → « Ma boutique » (`/dashboard/boutique`) |
| `app/dashboard/brands/page.tsx` | Placeholder « Bientôt » remplacé par une redirection vers `/dashboard/boutique` (anciens liens préservés) |
| `app/dashboard/page.tsx` + `components/dashboard/dashboard-home.tsx` | Prop optionnelle `shop` → encart « Crée ta boutique » / lien vers la boutique |
| `lib/dictionaries/fr.json`, `en.json` | Nouvelle section `shop` + clé `dashboard.nav_shop` |
| `.env.example` | `NEXT_PUBLIC_SITE_URL` (URL publique pour les liens / QR) |

## 3. Fichiers à ne pas toucher (phases 0-1)

`lib/poster-pipeline.ts`, `lib/image-compose.ts`, `lib/designed-background.ts`, `lib/art-directions.ts`,
`lib/product-analyzer.ts`, `lib/quality-checker.ts`, `lib/background-removal.ts`, `lib/knowledge/*`,
`lib/pricing.ts`, `lib/paytech.ts`, `app/api/generate-creation`, `app/api/regenerate-creation`,
`app/api/creations/**`, `app/api/render-overlay`, `app/api/paytech/**`, `app/api/polish-items`,
`components/dashboard/new-creation-wizard.tsx` (touché seulement en phase 6 : pré-remplissage par `?productId=`),
`creation-detail.tsx`, `unlock-*`, migrations 0001 → 0014.

## 4. Migrations SQL

- **0015_shops_products.sql** : tables + contraintes + index + triggers `updated_at`, limite de 4 photos,
  garde-fou de cohérence propriétaire, colonnes nullables sur `creations` (`format` a un défaut `'square'`).
- **0016_shop_media_bucket.sql** : bucket public (5 Mo, JPEG/PNG/WebP), policies par dossier utilisateur.
- Plus tard : `0017_credits_passes.sql` (phase monétisation), `0018_shop_orders.sql` (commandes).
- Exécution : SQL Editor Supabase, dans l'ordre, comme les migrations existantes. Idempotentes
  (`if not exists`, `drop policy if exists`).

## 5. Nouvelles routes API

| Route | Phase | Auth |
| --- | --- | --- |
| `POST /api/shop-media/upload` (`kind` = logo, banner, product) | 1 | Oui |
| Server actions `createShop`, `updateShop`, `checkSlug` | 1 | Oui |
| `POST /api/products/analyze` | 3 | Oui — Claude **Haiku** par défaut (vision + sortie structurée), catégorie contrainte à l'arbre existant |
| CRUD produits (server actions) | 2 | Oui |
| `POST /api/products/[id]/poster` → adaptateur → `generate-creation` | 6 | Oui |
| `GET /r/wa/[shop]/[product?]` (compte le clic puis redirige vers `wa.me`) | 4/9 | Non |
| `GET /q/[shop]` (compte le scan puis redirige) | 5 | Non |
| `POST /api/track` (vues, partages) | 9 | Non, limité en débit, écrit via service role |

## 6. Nouvelles pages

| Page | Phase |
| --- | --- |
| `/dashboard/boutique` (onboarding / aperçu), `/dashboard/boutique/modifier` | 1 |
| `/dashboard/produits`, `/dashboard/produits/nouveau`, `/dashboard/produits/[id]` | 2-3 |
| `/boutique/[slug]`, `/boutique/[slug]/p/[productSlug]` + `opengraph-image.tsx` | 4 |
| `/dashboard/boutique/stats` (ou bloc dans l'aperçu) | 8 |

## 7. Composants UI

Phase 1 : `ShopOnboarding` (3 étapes), `ShopOverview`, `ShopFormFields`, `LogoPicker`, `ShopBanner`.
Réutilisés : `Button`, `Input`, `Textarea`, `Card`, `Badge`, `PhoneInput`, `CategoryPicker`,
`CreationStepIndicator` (style d'indicateur d'étapes).
Phase 2+ : `ProductCard`, `ProductForm`, `PhotoSlots` (4 emplacements), `AiSuggestionReview`,
`ShareSheet`, `QrCodeCard`, `WhatsAppButton`, `StatTiles`.

## 8. RLS

| Table | Propriétaire (`authenticated`) | Public (`anon` + `authenticated`) |
| --- | --- | --- |
| `shops` | select / insert / update / delete si `owner_id = auth.uid()` ; update interdit si `status = 'suspended'` ; l'utilisateur ne peut jamais poser `suspended` | select si `status = 'published'` |
| `products` | tout si `owner_id = auth.uid()` **et** la boutique lui appartient | select si `status in ('active','sold_out')` et boutique publiée |
| `product_images` | tout si `owner_id = auth.uid()` et le produit lui appartient | select si produit visible |
| `shop_events` | select si la boutique lui appartient ; aucune écriture | aucune (écriture via service role dans `/api/track`) |
| `creations` | inchangé | inchangé |

Slug : fonction `is_shop_slug_available(text)` en `security definer` (la RLS cache les boutiques
brouillon des autres, une requête directe dirait « disponible » à tort).

## 9. Stockage Supabase

- Bucket existant `creations` (privé) : **inchangé**.
- Nouveau bucket `shop-media` (public) : `{user_id}/shops/{uuid}.webp` (logo, bannière),
  `{user_id}/products/{uuid}.webp` (phase 2). Le premier segment = `auth.uid()` → même convention que
  `creations`, policies simples.
- Pas de policy de lecture pour `anon` : les URL publiques fonctionnent sans, et le listing du bucket
  reste impossible.
- Pont phase 6 : l'adaptateur copie la photo produit dans `creations/{user_id}/…` avant d'appeler
  `generate-creation`, qui continue de lire le bucket `creations`.

## 10. Dépendances

- Phases 0-1 : **aucune** (sharp, zod, supabase, lucide déjà présents).
- Phase 5 : `qrcode` (≈ 30 Ko, génération SVG/PNG côté client, aucun service externe).

## 11. Risques

| Risque | Parade |
| --- | --- |
| Migration exécutée partiellement | Scripts idempotents ; ordre 0015 puis 0016 |
| Photos de téléphone > 4,5 Mo (limite Vercel) | Réduction côté navigateur avant envoi, puis sharp côté serveur |
| Faux « slug disponible » | Fonction `security definer` + gestion de l'erreur d'unicité (suffixe auto) |
| Boutique publiée sans page publique (phase 4 pas encore faite) | En phase 1 la boutique reste en brouillon ; « Publier » arrive avec la page publique |
| Régression du générateur | Aucun fichier du générateur modifié ; colonnes `creations` nullables ou avec défaut |
| Middleware : pages publiques qui ne rafraîchissent pas la session | Voulu : elles n'en ont pas besoin ; le dashboard reste protégé |
| Coût IA (phase 3) | Haiku pour l'analyse, image réduite à 1024 px avant envoi, 1 appel par produit |

## 12. Étapes de migration

1. Exécuter `0015` puis `0016` dans le SQL Editor (projet de test d'abord si disponible).
2. Lancer `supabase/tests/rls_shops.sql` sur la base de test.
3. Ajouter `NEXT_PUBLIC_SITE_URL=https://jaarle.com` aux variables Vercel.
4. Déployer le code (phases 0-1). Aucun impact sur les créations existantes.
5. Vérifier en production : création d'affiche (non-régression), puis création de boutique.

## 13. Tests

- `tsc --noEmit` et `next lint` à chaque étape ; `next build` avant déploiement.
- SQL : migrations rejouées deux fois (idempotence) sur une base Postgres avec un schéma Supabase simulé ;
  scénarios RLS : propriétaire, autre utilisateur, visiteur anonyme, boutique suspendue, 5ᵉ photo refusée.
- Manuel (mobile) : créer une boutique en < 5 min ; logo lourd (> 5 Mo) ; slug déjà pris ; édition ;
  menu « Ma boutique » ; ancien lien `/dashboard/brands`.
- Non-régression générateur : une affiche Standard + une Advanced + un service sans photo, déblocage PayTech.
