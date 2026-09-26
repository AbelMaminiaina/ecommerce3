# Architecture

Règles d'organisation du code (application mobile : voir [ARCHITECTURE-MOBILE.md](./ARCHITECTURE-MOBILE.md)). Elles décrivent l'état actuel du projet : tout nouveau code doit les suivre.
Si une règle doit évoluer, modifiez ce fichier en même temps que le code.

## Vue d'ensemble

```
ecommerce3/
├── backend/     API REST Express + Prisma (PostgreSQL) + Redis   → http://localhost:3011/api
├── frontend/    Next.js 14 (App Router) + NextAuth               → http://localhost:3000
├── docker/, nginx/, docker-compose*.yml, scripts/                 → infrastructure et déploiement (voir DEPLOY-DEMO.md)
└── package.json (racine) : `npm run dev` lance backend et frontend ensemble
```

- Le frontend ne touche **jamais** la base de données : tout passe par l'API REST du backend.
- Toutes les routes de l'API sont préfixées par `/api/<ressource>` (branchées dans `backend/src/index.ts`).
- Rôles : `customer` (particulier), entreprise (`pending` → `approved` / `rejected` / `suspended`),
  `platform_admin`. Une entreprise `approved` achète au prix de gros et peut vendre.

---

## Backend (`backend/src`)

| Dossier | Contenu | Règle |
|---|---|---|
| `index.ts` | Point d'entrée Express | Seul endroit où les routeurs sont branchés |
| `routes/` | Un fichier par ressource | Reçoit la requête, valide, interroge Prisma, répond |
| `middleware/auth.ts` | Contrôle d'accès | Les droits se déclarent **sur la route**, jamais dans le corps du handler |
| `lib/` | Logique métier pure et clients techniques | Pas d'accès `req`/`res` ; fonctions testables unitairement |
| `services/` | Effets de bord et orchestration | E-mails, déroulé des paiements Mobile Money |
| `testing/` | Faux serveurs des opérateurs | Pour le développement local (`npm run mock:*`) |
| `prisma/` | Schéma, migrations, seed, scripts de catalogue | — |

### Règles

1. **Validation** : tout ce qui vient du client (`req.body`, `req.query`) est validé par un **schéma zod**
   déclaré en haut du fichier de route, puis `schema.parse(...)` dans le `try`.
   Dans le `catch` : `if (error instanceof z.ZodError) return sendValidationError(res, error);`
   (`lib/validation.ts`, réponse `400 { error: <premier message> }`). Pour un message unique quel que soit le
   champ fautif : `schema.parse(req.body, singleMessage('…'))`.
   *Quelques routes plus anciennes (`auth`, `checkout`, `contact`, `newsletter`) renvoient aussi `details` :
   ne pas changer leur format, le frontend s'en sert.*
2. **Accès** : middlewares de `middleware/auth.ts` —
   `authenticate`, `optionalAuthenticate`, `requirePlatformAdmin`, `requireApprovedCompany`,
   `requireCanOrder`, `canOrderOrGuest`.
3. **Données** : les routes appellent Prisma directement (`import prisma from '../lib/prisma.js'`) ;
   pas de couche « repository ». Un calcul métier (prix, livraison, commission, expiration…) va dans `lib/`.
4. **Cache** : les lectures publiques de produits passent par `withCache` (`lib/cache.ts`, Redis) ;
   toute écriture sur un produit appelle `invalidateProductCache()`.
5. **Opérateurs Mobile Money** : chaque client (`lib/mvola.ts`, `orangeMoney.ts`, `airtelMoney.ts`) passe par
   `operatorFetch` de `lib/operatorHttp.ts` (délai maximal, erreurs normalisées en `OperatorError`).
6. **Images** : jamais en base64 dans la base ni dans le JSON. Une photo est envoyée en fichier à
   `POST /api/uploads` (admin ou entreprise approuvée), ré-encodée en WebP (≤ 1600 px) et enregistrée par
   `lib/uploads.ts` dans `UPLOAD_DIR` (volume Docker `uploads`) ; le produit ne stocke que l'URL
   `/uploads/<uuid>.webp` (servie avec un cache d'un an). Tout accès au stockage passe par `lib/uploads.ts`
   (`saveImage`, `deleteReplacedImages`, `deleteUploadedImages`) : pour passer à Cloudinary / S3, seul ce module change.
   Quand un produit perd des images ou est supprimé, ses fichiers sont supprimés.
   `src/scripts/migrateImagesToFiles.ts` convertit les anciennes images base64 (lancé à chaque démarrage du conteneur).
7. **Imports** ESM avec l'extension `.js` : `import { x } from '../lib/pricing.js'`.
8. **Tests** : Vitest, à côté du fichier (`x.ts` + `x.test.ts`). Prisma et Redis sont simulés via `lib/__mocks__`.

---

## Frontend (`frontend/src`)

### Deux layouts racine, deux univers de style

| Groupe de routes | URL | Style |
|---|---|---|
| `app/(shop)/` | `/`, `/produits`, `/panier`, `/checkout`, `/compte`, `/blog`, `/vendeurs`, `/cgv`… | Bootstrap 5 + thème ShopWise (`public/shopwise/*.css`). **Aucune classe Tailwind.** |
| `app/(admin)/` | `/admin/*`, `/vendeur/*` | Tailwind (`globals.css`) + thème admin ShopWise (`admin-shopwise.css`) |

Passer d'un groupe à l'autre recharge la page : les deux CSS ne se mélangent jamais.
Une page de la boutique n'utilise pas Tailwind ni `components/ui` ; une page de gestion n'utilise pas les
classes Bootstrap / `sw-*` de la boutique.

### Dossiers

| Dossier | Contenu |
|---|---|
| `app/(shop)/**/page.tsx` | Pages de la boutique. Composant serveur qui charge les données, partie interactive dans un `*Client.tsx` |
| `app/(admin)/admin/**`, `app/(admin)/vendeur/**` | Espace de gestion (pages client) ; protection d'accès dans le `layout.tsx` de chaque espace |
| `components/shop/` | Composants de la boutique : `ProductCard`, `ProductGrid`, `PageHeader`, `PaymentPanel`, `Toast`… |
| `components/shopwise/` | En-tête, pied de page et sections de l'accueil |
| `components/admin/` | `AdminShell` (barre latérale, barre supérieure, pied de page) et `PageHead` |
| `components/ui/` | Composants Tailwind de l'espace de gestion : `Button`, `Input`, `Select`, `Textarea`, `Checkbox`, `Modal` |
| `components/seller/`, `seo/`, `blog/`, `services/`, `providers/` | Composants par domaine |
| `lib/api/` | **Seule couche d'accès à l'API** (voir règles) |
| `hooks/` | État côté navigateur : panier (Zustand, persisté), favoris, catégories, droits (`useCompanyAccess`), paiement |
| `lib/` | Utilitaires (`formatPrice`, `getProductImage`…), coordonnées, métadonnées SEO, animations de la modale |
| `types/index.ts` | Types partagés (`Product`, `Order`…) |
| `data/` | Contenu statique : articles du blog, services, FAQ |
| `public/shopwise/`, `public/electro/` | CSS et icônes du thème ; `public/electro/img/` contient des visuels produits référencés en base : ne pas renommer |

### Règles

1. **Accès à l'API uniquement via `lib/api/`** — un fichier par ressource (`products.ts`, `categories.ts`,
   `checkout.ts`, `seller.ts`…). Aucun `fetch` ni `process.env.NEXT_PUBLIC_API_URL` dans les pages,
   composants ou hooks.
   - Navigateur : `fetchAPI(endpoint, { token, method, body })` — lève une `Error` portant le message du backend.
     Côté page : `try { await …; } catch (err) { err instanceof Error ? err.message : '…' }`.
   - Server Components : fonctions `fetch…OnServer` construites sur `fetchServerAPI` (URL interne du backend,
     sans le cache de données de Next.js : les produits embarquent leurs images).
   - Si un nom de fonction d'API entre en conflit avec un handler local, importer avec un alias
     (`import { saveProduct as persistProduct }`).
2. **Exports** : une seule export nommée par composant (`export function ProductCard`).
   Seuls les fichiers imposés par Next.js (`page.tsx`, `layout.tsx`, `error.tsx`…) et les `*Client.tsx`
   ont une export par défaut.
3. **Icônes** : Bootstrap Icons partout (`<i className="bi bi-…" aria-hidden="true" />`), boutique comme gestion.
   Pas d'autre bibliothèque d'icônes.
4. **Authentification** : NextAuth (`app/api/auth/[...nextauth]`). Le jeton du backend est `session.accessToken`,
   à passer en `token` aux fonctions de `lib/api`.
5. **Formulaires** : `react-hook-form` + `zod` côté client ; le backend revalide toujours.
6. **Photos** : `uploadImage(file, token)` (`lib/api/uploads.ts`) réduit l'image dans le navigateur puis l'envoie ;
   on place l'URL renvoyée dans `images`. Le bouton d'enregistrement reste désactivé pendant un envoi.
   `/uploads/*` est servi par nginx en production et réécrit vers le backend par `next.config.js` en dev.
7. **Tests** : Vitest + Testing Library, à côté du fichier. Dans un test qui simule `fetch`, la réponse doit
   inclure `ok: true` (comme une vraie réponse).

---

## Ajouter une fonctionnalité : aide-mémoire

1. **Backend** : schéma zod + route dans `routes/<ressource>.ts` (middlewares d'accès sur la route),
   logique réutilisable dans `lib/`, test `*.test.ts`.
2. **Frontend** : fonction dans `lib/api/<ressource>.ts`, puis la page ou le composant dans le bon groupe
   (`(shop)` ou `(admin)`) avec le style de ce groupe.
3. **Vérifier** : `npm test` et `npx tsc --noEmit` dans `backend/` et `frontend/`, `npm run lint` dans `frontend/`
   (c'est ce que lance la CI, `.github/workflows/ci.yml`).
