# Procédure — ajout d'une catégorie (feuille) à l'arbre du Market

À suivre chaque fois qu'une feuille est ajoutée à `lib/knowledge/category-tree.ts` (secteur ouvert au Market,
voir `MARKET_INDUSTRIES` dans `lib/market/categories.ts`). Ajouter une feuille ne demande aucune migration, mais
**ne reclasse pas** les produits existants : sans cette procédure, ils restent hors des pages catégorie
(cas du 2026-10-08 : 15 annonces de maillots, lunettes de vue, Crocs, remèdes naturels restées sans catégorie).

Règle d'or : **aucune écriture sans validation humaine**. Jamais de `--apply` sur toutes les boutiques d'un coup.

## 1. Vérifier les produits existants concernés

Dans le SQL Editor de Supabase (lecture seule) :

```sql
-- Annonces en ligne sans catégorie Market, par boutique (Market ou non)
select s.slug as boutique, p.slug, p.name, p.subject_type, p.category as rayon, p.created_at,
       (p.shop_id in (select shop_id from public.market_shop_ids())) as boutique_sur_market
from public.products p join public.shops s on s.id = p.shop_id
where s.status = 'published' and p.status in ('active', 'sold_out') and p.market_category is null
order by s.slug, p.created_at;
```

Repérer celles qui correspondent à la nouvelle feuille (nom, rayon, description).

## 2. Lancer le classement en simulation

```bash
npx tsx scripts/classify-market-products.mjs --all-shops     # simulation : n'écrit rien
npx tsx scripts/classify-market-products.mjs --shop <slug>   # simulation sur une boutique
```

À savoir avant de lancer :
- La simulation **n'écrit rien en base** mais envoie nom, rayon, description et 1re photo de chaque annonce à l'API
  Anthropic (coût faible, données des vendeurs transmises au modèle).
- Sans option, seules les boutiques **Pro** sont traitées ; `--all-shops` prend **toutes** les boutiques, y compris
  brouillons et suspendues (leurs propositions sont à ignorer).
- Le bloc « Conditions du Market » affiché par boutique date des premières règles (Pro + 3 annonces) : il ne
  reflète pas la période d'ouverture (6 annonces, Pro ou non) ni les secteurs vides acceptés. S'y fier avec prudence.
- `--force` reclasse aussi les annonces déjà classées : à ne pas utiliser pour ce cas.

## 3. Relire les résultats

Pour chaque ligne « ✓ » proposée, vérifier :
- le **type d'article** (un ensemble n'est pas un t-shirt, un short n'est pas un pantalon) ;
- le **type de fiche** (`product` / `service`) : une fiche mal typée se corrige d'abord, avec le vendeur ;
- les **doublons** probables (même nom, slug en `-2`) : à signaler au vendeur, ne pas supprimer ;
- les annonces sans feuille adaptée (« · aucune catégorie adaptée ») : elles demandent une décision sur l'arbre,
  pas un classement approchant.

Noter la liste validée (boutique, slug, catégorie retenue).

## 4. Validation humaine, puis application ciblée

Après validation explicite :
- quelques annonces : bouton **« Classer »** de `/dashboard/admin/market` (une par une, journalisé) ;
- une boutique entière dont toutes les propositions sont validées : `--shop <slug> --apply`.

Ne jamais lancer `--all-shops --apply` : il applique toutes les propositions, sans seuil de confiance.

## 5. Vérifier après application

- `/dashboard/admin/market` : le compteur « Annonces sans catégorie Market » baisse du nombre attendu.
- `/market/<nouvelle-feuille>` et sa catégorie parente : les annonces apparaissent (cache de 5 minutes).
- Puces et compteurs de l'accueil du Market, page de recherche avec `?categorie=<feuille>`.
- `node scripts/smoke-public-routes.mjs https://jaarle.com` : tous les contrôles au vert.
