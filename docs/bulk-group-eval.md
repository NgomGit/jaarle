# Bulk Upload — Phase 0 : banc d'évaluation du regroupement IA

Ce banc vérifie que l'IA range correctement un lot de photos mélangées en « un groupe = un article », **avant** de construire l'interface et la persistance du Bulk Upload.

Le banc ne fait aucune des opérations suivantes :
- écrire en base ;
- créer un produit ;
- appeler une route de l'application ;
- consommer de quota.

Il lit des dossiers locaux et écrit un rapport dans `tmp/bulk-group-eval/<date>/`. Le dossier `tmp/` est ignoré par git.

## Fichiers

| Fichier | Rôle |
|---|---|
| `lib/ai/bulk-group.ts` | Consigne, schéma de sortie structurée, appel Anthropic (`groupMediaWithAi`), normalisation sûre (`normalizeGrouping`). La phase 1 réutilisera ce module tel quel. |
| `lib/ai/bulk-group-hash.ts` | Empreintes locales : dHash + couleur moyenne (doublons), vignette 512 px envoyée à l'IA, estimation des tokens. |
| `lib/ai/bulk-group-eval.ts` | Format `truth.json`, mesures (fusions, séparations, non rangées, variantes, doublons), synthèse, seuils de passage en phase 1. |
| `lib/ai/__tests__/bulk-group.test.ts` | Tests Vitest (normalisation, couverture, mesures). |
| `scripts/bulk-group-fixtures.ts` | Génère 7 lots **synthétiques** (dessins, aucune donnée réelle). |
| `scripts/bulk-group-eval.ts` | Le banc. |

## Commandes

Elles se lancent à la racine du dépôt. `vite-node` est déjà fourni par Vitest.

```bash
# Tests unitaires
npx vitest run lib/ai/__tests__/bulk-group.test.ts

# Lots synthétiques → tmp/bulk-group-lots/synth-*/ (ffmpeg facultatif : ajoute une vidéo)
npx vite-node --config vitest.config.ts scripts/bulk-group-fixtures.ts

# Simulation : aucun appel externe. Vérifie les lots, le calcul et le rapport
npx vite-node --config vitest.config.ts scripts/bulk-group-eval.ts -- --mock

# Ce qui serait envoyé : nombre d'images, tokens, coût estimé. Aucun appel
npx vite-node --config vitest.config.ts scripts/bulk-group-eval.ts -- --dry-run --models haiku,sonnet --runs 3

# Évaluation réelle (clé ANTHROPIC_API_KEY lue dans .env.local)
npx vite-node --config vitest.config.ts scripts/bulk-group-eval.ts -- --models haiku --runs 3
npx vite-node --config vitest.config.ts scripts/bulk-group-eval.ts -- --models haiku,sonnet --runs 3 --lot kok-01,kok-02
```

**Options**

| Option | Effet |
|---|---|
| `--lots <dossier>` | Dossier des lots (défaut `tmp/bulk-group-lots`) |
| `--lot a,b` | Ne prendre que ces lots |
| `--models haiku,sonnet,<id complet>` | Modèles à comparer (`haiku` = `claude-haiku-4-5-20251001`, `sonnet` = `claude-sonnet-5`) |
| `--runs N` | Passages par lot (mesure la stabilité) |
| `--size 512` | Grand côté des vignettes |
| `--shuffle <graine>` | Mélange l'ordre des photos (test de robustesse) |
| `--concurrency 2` | Appels en parallèle |
| `--hash-hints` | Envoie aussi à l'IA les paires « très proches » calculées par empreinte. Par défaut, seuls les fichiers identiques sont signalés (voir « Empreintes » ci-dessous) |
| `--include-synthetic=false` | Ignore les lots synthétiques |

## Préparer un lot réel

**Confidentialité**
- N'utilise que tes propres photos (par exemple KOK), ou des photos de vendeurs qui ont donné leur **accord écrit**.
- Le banc **refuse d'envoyer** à Anthropic un lot réel dont `truth.json` n'a pas de champ `consent`.
- Les lots restent dans `tmp/` : non versionnés, jamais poussés sur git.

**1. Dossier.** Un dossier par lot, par exemple `tmp/bulk-group-lots/kok-01/`.

**2. Photos.** Copie les photos **telles que le vendeur les choisirait**, dans l'ordre de l'appareil, sans renommer ni recadrer.
- Formats acceptés : JPG, PNG, WebP. Convertis les HEIC en JPG (sur Mac : Aperçu → Exporter, ou `sips -s format jpeg IMG.HEIC --out IMG.jpg`).
- 10 à 30 photos par lot.

**3. Vidéos (facultatif).** Formats `.mp4`, `.mov`, `.m4v`, `.webm`. ffmpeg est nécessaire (`brew install ffmpeg`). Le banc tire 3 images (à 20 %, 50 % et 80 % de la durée), comme le fera le navigateur en phase 1.

**4. `truth.json`.** Il décrit les groupes corrects. Chaque fichier du dossier doit apparaître dans **un seul** groupe. Une vidéo se cite par son nom : ses images héritent de son groupe.

```json
{
  "lot": "kok-01",
  "description": "Nouvelle collection : 6 articles, photos prises au téléphone",
  "consent": "Photos de ma boutique KOK, usage autorisé par Mouhamed Ngom le 2026-10-12",
  "shopContext": "Marque de mode à Dakar : boubous, chemises, t-shirts",
  "cases": ["angles", "similaires", "couleurs", "doublons", "flou", "multi-categories"],
  "groups": [
    { "id": "chemise-wax-bleue", "items": ["IMG_2201.jpg", "IMG_2202.jpg", "IMG_2210.jpg"] },
    { "id": "chemise-wax-rouge", "items": ["IMG_2203.jpg", "IMG_2204.jpg"] },
    { "id": "boubou-blanc", "items": ["IMG_2205.jpg", "VID_2206.mp4"] }
  ],
  "ambiguous": ["IMG_2210.jpg"],
  "duplicates": [["IMG_2201.jpg", "IMG_2202.jpg"]],
  "variants": [["chemise-wax-bleue", "chemise-wax-rouge"]]
}
```

| Champ | Règle |
|---|---|
| `groups` | Un groupe = **un seul objet physique** à vendre. Deux t-shirts noirs différents = deux groupes, même s'ils se ressemblent. |
| `ambiguous` | Photos qu'il est **acceptable** de laisser « non rangées » : trop floues, trop serrées, ou dos sans détail qui pourrait aller à deux articles. Elles restent aussi dans leur vrai groupe. |
| `duplicates` | Photos identiques ou presque (rafale, capture d'écran de la même photo), forcément dans le même groupe. |
| `variants` | Paires de groupes = même modèle dans une autre couleur. |
| `cases` | Étiquettes libres, pour lire le rapport. |

Lance ensuite `--dry-run` pour vérifier que le lot est accepté, puis l'évaluation réelle.

**Lots recommandés** (5 à 10 en tout)
1. 3-4 articles, 3-5 angles chacun (de face, de dos, porté, étiquette).
2. Articles qui se ressemblent : t-shirts unis, bijoux dorés, flacons.
3. Un modèle en 2-3 couleurs.
4. Rafales et doublons (même photo envoyée deux fois, capture WhatsApp).
5. Photos ratées : floues, sombres, trop serrées.
6. Plusieurs catégories (mode + beauté + accessoires).
7. Un lot « réel » de 25-30 photos tel qu'un vendeur l'enverrait, avec une vidéo.

## Lire le rapport

`report.md` donne, pour chaque modèle :

| Mesure | Définition |
|---|---|
| **Mal fusionnées** | Photos rangées avec un autre article. **C'est l'erreur la plus grave** : le vendeur risque de ne pas la voir et de créer un produit faux. |
| **Non rangées évitables** | Photo nette laissée de côté. Elle coûte un geste au vendeur, mais aucune erreur n'est créée. |
| **Précision / rappel (paires)** | La précision baisse avec les fusions, le rappel avec les séparations. |
| **Articles exacts** | Articles retrouvés avec exactement leurs photos. |
| **Corrections / 10 photos** | Gestes estimés pour le vendeur : déplacer une photo mal fusionnée, réunir un fragment, ranger une photo nette. |
| **Sorties brutes à corriger** | Appels où l'IA a renvoyé un indice invalide, oublié une photo ou cité une photo deux fois. La normalisation les rattrape, **aucun média n'est perdu** (colonne « Perdus », toujours 0). |
| **Écart entre passages** | Stabilité d'un même lot d'un passage à l'autre. |
| **Coût / 30 photos, durée p50 / p95** | Mesurés sur les tokens réels. |

Les sorties détaillées sont dans `tmp/bulk-group-eval/<date>/<lot>/<modèle>-run<N>.json` : sortie brute, résultat normalisé avec noms de fichiers et vrai groupe, mesures.

## Empreintes d'image (doublons)

Le banc calcule pour chaque photo :
- le SHA-256 : fichier identique = **doublon certain** ;
- un dHash 64 bits + la couleur moyenne : paire **très proche**.

Mesure faite sur les lots synthétiques : des photos de deux articles **différents** prises de la même façon (deux flacons identiques sauf l'étiquette, deux t-shirts noirs vus de dos) ont **la même empreinte**. Une vraie rafale recadrée et recompressée en a au contraire une plus éloignée.

Conséquences :
- seuls les fichiers identiques sont signalés à l'IA comme doublons ;
- les paires très proches servent uniquement à marquer les groupes « à vérifier », sans jamais fusionner. `--hash-hints` permet de mesurer l'effet de les envoyer quand même.

## Critères de passage en phase 1

Les critères sont définis dans `PHASE1_THRESHOLDS` (`lib/ai/bulk-group-eval.ts`). Ils doivent être atteints **sur au moins 5 lots réels, avec 3 passages chacun** :

| Critère | Cible |
|---|---|
| Médias perdus | 0 |
| Photos mal fusionnées | ≤ 3 % |
| Non rangées évitables | ≤ 10 % |
| Précision des paires | ≥ 0,95 |
| Rappel des paires | ≥ 0,85 |
| Corrections | ≤ 2 pour 10 photos |
| Appels en échec | ≤ 2 % |
| Durée p95 | ≤ 30 s |
| Coût | ≤ 0,03 $ pour 30 photos |

## Comparer un autre modèle

```bash
npx vite-node --config vitest.config.ts scripts/bulk-group-eval.ts -- --models haiku,sonnet --runs 3
npx vite-node --config vitest.config.ts scripts/bulk-group-eval.ts -- --models claude-haiku-4-5-20251001,<autre-id> --runs 3
```

**Coût d'un nouveau modèle.** Le coût est calculé avec `MODEL_PRICES_PER_MTOK` (`lib/billing/usage.ts`). Un modèle absent de cette table est compté à 3 $ / 15 $ par million de tokens. Ajoute-le à la table pour obtenir un coût exact.

**Modèle de l'application.** Pour la phase 1, le modèle se règlera avec `BULK_GROUP_MODEL` (Haiku par défaut).

**Mêmes lots pour tous les modèles.** Compare toujours les modèles sur les mêmes lots et avec le même nombre de passages. Garde les rapports : ils servent de référence quand on change la consigne.
