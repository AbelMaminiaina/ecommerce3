# Fonctionnalités - Tsena Pro

Ce document recense les fonctionnalités du site, organisées par domaine.

## Boutique

- Catalogue de produits (poulet, porc, poisson, akanga, caille, œufs frais, œufs fécondés, produits transformés, accessoires)
- Filtrage par catégorie et recherche, avec tri automatique (produits en stock affichés en premier)
- Fiche produit avec galerie d'images, description, caractéristiques et produits similaires
- Panier persistant côté client (Zustand + localStorage), avec ajout/suppression/modification de quantité
- Commande sans compte (guest checkout)
- Frais de livraison calculés automatiquement (standard, express, retrait sur place) avec livraison gratuite au-delà de 200 000 Ar
- Suivi de commande côté client par numéro de commande ou par e-mail

## Paiement

- Paiement par Mobile Money (MVola) : instructions de paiement envoyées par e-mail après commande
- Gestion du statut de commande (en attente / en préparation) selon la disponibilité du stock au moment de l'achat

## Emails transactionnels

- E-mail de confirmation de commande envoyé au client (récapitulatif, instructions de paiement MVola)
- E-mail de notification envoyé à l'administrateur pour chaque nouvelle commande
- E-mail d'annulation envoyé au client lorsqu'une commande est annulée depuis l'admin, avec le motif d'annulation saisi par l'administrateur
- Envoi asynchrone (n'impacte pas le temps de réponse du checkout / de la mise à jour de statut)

## Administration

- Gestion des produits : création, modification, désactivation (visibilité), suppression (avec suppression douce si le produit est lié à des commandes existantes)
- Édition des photos produit indépendamment du reste de la fiche
- Gestion des catégories : création, modification, suppression, réordonnancement (dynamique, plus besoin de modifier le code pour ajouter une catégorie)
- Gestion des stocks avec mise à jour rapide de la quantité disponible
- Gestion des commandes : liste, détails, mise à jour du statut, annulation avec saisie d'un motif (envoyé au client par e-mail)
- Messages de contact et abonnés newsletter consultables depuis l'admin
- Interface admin responsive (mobile)

## Contenu du site

- Pages présentant les races de poules élevées (caractéristiques, productivité, origine)
- Pages services, blog, témoignages
- Pages légales (CGV, mentions légales, politique de confidentialité)
- Formulaire de contact et inscription à la newsletter

## SEO & Référencement

- Sitemap et robots.txt générés dynamiquement
- Données structurées JSON-LD
- Métadonnées dynamiques par page

## Infrastructure

- Cache Redis (Upstash en production, ioredis en local) sur les endpoints produits/catégories/races pour réduire la charge base de données
- Déploiement Docker (frontend, backend, PostgreSQL, Redis)
- HTTPS via Let's Encrypt / Nginx
- CI/CD via GitHub Actions (lint + tests + build)
- `scripts/deploy-demo.ps1` : déploiement en une commande sur le VPS (voir [DEPLOY-DEMO.md](./DEPLOY-DEMO.md)) ; les secrets sont générés au premier déploiement et conservés ensuite

## Tests unitaires

Mis en place en 2026-08 : couverture par tests unitaires sur le backend et le frontend, avec **Vitest** comme framework de test.

### Backend (`backend/`)

- **82 tests** répartis sur 8 fichiers
- Prisma mocké via `vitest-mock-extended` (`src/lib/__mocks__/prisma.ts`) — aucune base de données requise pour lancer les tests
- Redis mocké (`src/lib/__mocks__/redis.ts`) pour tester la logique de cache indépendamment de l'infrastructure
- Couverture : routes API (`products`, `checkout` — y compris l'annulation de commande avec motif, `categories`, `contact`, `newsletter`, `chickens`), logique de cache (`lib/cache.ts`), service d'e-mails (`emailService.ts` — confirmation, notification admin, annulation)
- Cas testés : validation des payloads (Zod), calculs métier (sous-total, frais de port, gestion du stock), transformation des données, comportements d'erreur (404, 400, 500)

### Frontend (`frontend/`)

- **81 tests** répartis sur 8 fichiers
- **Testing Library** + **jsdom** pour tester les hooks React
- Couverture : fonctions utilitaires (`lib/utils.ts` : formatage prix/date, validation email/téléphone/code postal, calcul frais de port...), hooks (`useCart`, `useCategories`, `useMediaQuery`), couche d'appel API (`lib/api/*`)

### Lancer les tests

```bash
# Backend
cd backend
npm test              # lance les tests une fois
npm run test:watch    # mode watch
npm run test:coverage # avec rapport de couverture

# Frontend
cd frontend
npm test
npm run test:watch
npm run test:coverage
```

Intégrés au pipeline CI (`.github/workflows/ci.yml`) : chaque push/PR sur `main` ou `develop` exécute `npm test` pour le frontend et le backend, en plus du lint et du build.

### À faire pour aller plus loin

- Tests d'intégration bout-en-bout (checkout complet avec une vraie base de test, par exemple via Testcontainers)
- Tests des composants React de présentation (actuellement non couverts, la priorité a été mise sur la logique métier)
