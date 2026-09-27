# Architecture de l'application mobile Tsena Pro (Android et iPhone)

Complète [ARCHITECTURE.md](./ARCHITECTURE.md). L'application mobile réutilise **le backend existant** : même API,
même base de données, mêmes règles métier que le site web.

## 1. Choix technologiques

| Besoin | Choix | Raison |
|---|---|---|
| Framework | **React Native + Expo** (SDK 52+) | Un seul code TypeScript pour Android et iPhone ; compilation dans le cloud (pas de Mac nécessaire) |
| Navigation | **Expo Router** | Routes par fichiers, comme le site Next.js |
| Données serveur | **TanStack Query** | Cache, rafraîchissement, reprise automatique sur réseau instable, mode hors connexion |
| État local | **Zustand** (déjà utilisé sur le site) + stockage persistant | Panier et favoris, même logique que le web |
| Formulaires | **react-hook-form + zod** | Mêmes règles de validation que le site |
| Jetons de session | **expo-secure-store** | Stockage chiffré (Keychain iOS, Keystore Android) |
| Images | **expo-image** | Cache disque, miniatures |
| Paiement | **expo-web-browser** + lien d'application `tsenapro://` | Page Orange Money puis retour dans l'application |
| Notifications | **expo-notifications** | Un seul service pour Android et iPhone |
| Erreurs | **Sentry** | Plantages en production |
| Tests | **Jest + Testing Library**, puis **Maestro** | Unitaires, puis scénarios sur téléphone |
| Publication | **EAS Build / Submit / Update** | Compilation cloud, envoi aux stores, correctifs sans nouvelle version store |

## 2. Vue d'ensemble

```
                 ┌──────────────── Backend (partagé) ───────────────────────────┐
                 │  Express + Prisma + PostgreSQL + Redis    /api/*   /uploads/* │
                 └──────────────▲───────────────────────────────▲───────────────┘
                                │ HTTPS + Bearer                 │ HTTPS + Bearer (+ refresh token)
             ┌──────────────────┴──────────┐      ┌─────────────┴──────────────┐
             │  Site web (Next.js)         │      │  Application (Expo)         │
             │  boutique + admin + vendeur │      │  Android + iPhone           │
             └──────────────▲──────────────┘      └─────────────▲──────────────┘
                            └──────────── packages/shared ───────┘
                              types, schémas zod, client API, calcul des prix
```

Principe : **le code métier est écrit une seule fois** (types, validation, appels API, paliers de prix, quantité
minimum, livraison) dans `packages/shared`, utilisé par le site et par l'application.

## 3. Organisation du dépôt et couches de l'application

```
ecommerce3/
├── backend/                 API (existant)
├── frontend/                site web (existant)
├── packages/shared/src/     code commun, sans React : types, prix, validation (zod), panier, client API
└── mobile/src/              application Expo
    ├── app/                 1. ÉCRANS (Expo Router) : mise en page et navigation uniquement
    │   ├── (tabs)/          Accueil · Mes commandes · Favoris · Profil
    │   ├── catalogue, panier, produit/[slug], commande/ (formulaire, paiement), auth/, compte/
    │   └── _layout.tsx      installe le cache (TanStack Query), les polices, la session
    ├── features/            2. DOMAINES : données, états et composants métier
    │   ├── queryKeys.ts     toutes les clés du cache, en un seul endroit
    │   ├── auth/            session (connexion, inscription, suppression du compte)
    │   ├── catalog/         queries.ts (catalogue, fiche, avis, catégories) · ProductCard
    │   ├── cart/            panier local · HeaderActions (icônes recherche et panier)
    │   ├── checkout/        useCheckoutForm (livraison, coordonnées, validation, envoi)
    │   ├── orders/          mes commandes, passage de commande
    │   ├── payment/         Mobile Money (suivi, Orange Money, référence manuelle)
    │   └── wishlist/        favoris
    ├── components/          3. INTERFACE GÉNÉRIQUE, sans métier : ui (boutons, champs…), Brand, ProductImage…
    ├── hooks/               3. hooks génériques (useDebounced)
    ├── lib/                 4. INFRASTRUCTURE : config (variables d'environnement), session (secure-store),
    │                           api (client), images, storage
    └── theme/               couleurs et polices (#0d9488, Plus Jakarta Sans)
```

**Règle des couches** : chaque couche n'utilise que les couches en dessous (1 → 2 → 3 → 4 → `theme` / `@tsena/shared`).
Elle est **vérifiée par le lint** (`mobile/eslint.config.js`, `npx expo lint`) :

- un écran n'appelle jamais l'API ni `useQuery` directement : il utilise un hook de `features/` (`useProduct`, `useMyOrders`…) ;
- `components/` et `hooks/` ne dépendent d'aucun domaine ; `lib/` ne dépend de rien au-dessus d'elle ;
- les clés du cache ne sont écrites que dans `features/queryKeys.ts`.

**Pas de code inutile sur le téléphone** : le code propre à l'aperçu web est dans des fichiers `*.web.ts`
(ex. `lib/session.web.ts`), que Metro n'embarque jamais dans l'application Android / iPhone ; le code métier
partagé est écrit une fois dans `packages/shared`. Détection du code mort : `npx knip` dans `mobile/`.

## 4. Contrat API utilisé par l'application

| Besoin | Endpoint | Remarque |
|---|---|---|
| Connexion | `POST /api/auth/login` `{ email, password, client: 'mobile' }` | Renvoie `token` (accès, **1 heure** avec `client: 'mobile'`, 7 jours pour le site) **et** `refreshToken` (60 jours). 10 essais par compte et par IP toutes les 15 min (429 ensuite) |
| Renouvellement | `POST /api/auth/refresh` `{ refreshToken }` | Nouveau `token` + nouveau `refreshToken` (rotation) ; 401 = se reconnecter |
| Déconnexion | `POST /api/auth/logout` `{ refreshToken }` | Ferme la session de l'appareil |
| Suppression du compte | `DELETE /api/auth/me` `{ password }` | Exigée par Apple et Google ; commandes conservées (anonymisées) |
| Profil | `GET /api/auth/me` | |
| Catalogue | `GET /api/products?page=1&limit=20` | Avec `limit` : `{ products, total, page, limit, hasMore }` ; sans `limit` : liste complète (site web) |
| Miniatures | champ `thumbnails` de chaque produit | Même ordre que `images` ; 400 px (0,3 Ko au lieu de 3 Ko sur l'exemple testé) |
| Envoi de photo | `POST /api/uploads` (multipart, champ `image`) | Vendeur approuvé ou admin ; renvoie `{ url }` |
| Commande, paiement, suivi | `/api/checkout`, `/api/payments/*` | Identiques au site |

### Session sur mobile

1. Connexion : enregistrer `token` et `refreshToken` dans **expo-secure-store** (jamais en clair).
2. Chaque appel : `Authorization: Bearer <token>`.
3. Réponse **401** : appeler `/api/auth/refresh` **une seule fois** (verrou partagé entre requêtes simultanées),
   enregistrer les nouveaux jetons, rejouer la requête. Si le renouvellement échoue : écran de connexion.
4. Un jeton de renouvellement déjà utilisé qui revient ferme **toutes** les sessions du compte (vol probable).

Limite connue : après une suppression de compte, un jeton d'accès déjà émis reste accepté jusqu'à son expiration (1 heure au plus pour l'application)
(les jetons ne sont pas vérifiés en base à chaque appel) ; l'application l'efface immédiatement.

## 5. HTTPS

Android et iPhone refusent le HTTP simple. Sans nom de domaine, pour **tester** :

- **Backend local** : tunnel Cloudflare gratuit vers le backend (adresse `https://xxxx.trycloudflare.com`,
  change à chaque lancement) :
  ```bash
  docker run --rm cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://host.docker.internal:3011
  ```
- **Serveur (VPS)** : le lien Cloudflare de la démo (`.\scripts\deploy-demo.ps1 -Action url`).

L'adresse de l'API est une variable (`EXPO_PUBLIC_API_URL`) : on la change sans toucher au code.
Pour la **publication** sur les stores, une adresse fixe est indispensable (domaine + HTTPS, ou tunnel Cloudflare nommé).

## 6. Hors connexion, images, paiement, notifications

- **Hors connexion** : TanStack Query conserve catalogue et fiches consultées ; le panier est local ; une bannière
  signale l'absence de réseau ; la commande exige le réseau.
- **Images** : `thumbnails` dans les listes, `images` sur la fiche produit ; cache disque d'expo-image.
- **Paiement** : MVola / Airtel → validation sur le téléphone, suivi par `GET /api/payments/auto/attempt/:id` ;
  Orange Money → page Orange dans `expo-web-browser`, retour par `tsenapro://commande/<numéro>`.
- **Notifications** : jeton Expo enregistré côté backend ; envoi à la confirmation de commande et de paiement.

## 7. Plan et avancement

| Phase | Contenu | État |
|---|---|---|
| **0. Fondations** | Pagination du catalogue | ✅ fait |
| | Miniatures 400 px (+ création des miniatures manquantes au démarrage) | ✅ fait |
| | Session renouvelable (refresh token, rotation, détection de réutilisation, déconnexion) | ✅ fait |
| | Suppression du compte (anonymisation, retrait des produits d'un vendeur) | ✅ fait |
| | Test du parcours mobile complet en HTTPS (tunnel Cloudflare) | ✅ fait (18/18) |
| | `packages/shared` (types, prix, schémas, panier, client API avec renouvellement de session ; 13 tests) — utilisé par l’application ; le site le reprendra (contexte Docker `./frontend` à élargir) | ✅ fait (mobile) |
| | Projet Expo SDK 57 (`mobile/`, workspaces npm, Expo Router, jetons dans expo-secure-store) | ✅ fait |
| | Versionnage `/api/v1`, retour Orange Money vers l'application, enregistrement des téléphones (notifications) | à faire |
| **1. Application acheteur** | Écrans : accueil, catalogue (recherche, catégories, défilement infini), fiche, panier, commande (avec ou sans compte), paiement MVola / Airtel / Orange Money / référence manuelle, compte, mes commandes, suppression du compte | ✅ écrits (types, lint, bundles Android et iOS OK) |
| | Hors connexion : cache catalogue gardé 7 jours, panier local, bannière réseau | ✅ fait |
| | Scénario complet contre le backend (catalogue → inscription → renouvellement 401 → commande → paiement → suppression) | ✅ 12/12 |
| | Essai sur téléphone (Expo Go ou build de développement) via tunnel HTTPS | à faire |
| | Images de démonstration `/electro/img/…` servies par le site, pas par le backend : invisibles sur mobile avec un tunnel vers le seul backend (les photos `/uploads/…` s'affichent) | à corriger |
| **2. Espace vendeur** | Mes produits (photo depuis l'appareil), stock, commandes reçues, gains | 1 à 2 semaines |
| **3. Publication** | Notifications, Sentry, captures, politiques, Play Store (25 $) et App Store (99 $/an) | 1 semaine |
