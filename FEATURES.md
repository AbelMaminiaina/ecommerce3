# Fonctionnalités - Tsena Pro

Ce document recense les fonctionnalités du site, organisées par domaine.

## Boutique

- Catalogue de produits (poulet, porc, poisson, akanga, caille, œufs frais, œufs fécondés, produits transformés, accessoires)
- Filtrage par catégorie et recherche, avec tri automatique (produits en stock affichés en premier)
- Fiche produit avec galerie d'images, description, caractéristiques et produits similaires
- Conseiller IA : le client décrit son besoin, l'IA (Mistral, puis Gemini en secours) propose jusqu'à 4 produits du catalogue ; sans clé ou en cas de panne, recherche par mots-clés. Section sur l'accueil et le catalogue, bouton flottant « Conseil » ailleurs ; 10 questions par heure et par visiteur, réponses en cache 1 h
- Panier persistant côté client (Zustand + localStorage), avec ajout/suppression/modification de quantité
- Commande sans compte (guest checkout)
- Connexion par téléphone sans mot de passe : code à 6 chiffres envoyé par SMS (valable 10 min, 5 essais, 1 minute entre deux envois, 5 codes par heure et par numéro). Un numéro inconnu crée un compte particulier (prénom + nom, sans e-mail) ; un compte créé par e-mail peut ajouter son numéro depuis « Mon compte »
- Frais de livraison calculés automatiquement (standard, express, retrait sur place) avec livraison gratuite au-delà de 200 000 Ar
- Suivi de commande côté client par numéro de commande ou par e-mail

## Paiement

- Paiement garanti : la plateforme garde l'argent jusqu'à la réception. Dans « Mon compte », l'acheteur confirme la réception ou signale un problème (pendant `BUYER_PROTECTION_DAYS` jours après la livraison, 3 par défaut) ; sans signalement, la réception est confirmée automatiquement. Le vendeur n'est reversé qu'une fois la commande reçue ; un litige bloque le reversement jusqu'à la décision de l'administrateur (page « Litiges » : rembourser l'acheteur ou libérer l'argent)
- Paiement à la livraison (`CASH_ON_DELIVERY=true`) : espèces au livreur ou au retrait, pour les clients connectés, dans les villes desservies (Antananarivo par défaut) et jusqu'à un montant plafonné. Le vendeur prépare et expédie sans attendre ; l'administrateur marque la commande « livrée et encaissée » à la remise de l'argent
- Paiement par Mobile Money (MVola) : instructions de paiement envoyées par e-mail après commande
- Gestion du statut de commande (en attente / en préparation) selon la disponibilité du stock au moment de l'achat

## SMS

- Prestataire au choix (`SMS_PROVIDER`) : API SMS Madagascar d'Orange Developer, Twilio, ou mode démonstration (code affiché à l'écran, aucun SMS envoyé)
- SMS de suivi au mobile de l'acheteur, en plus des e-mails : commande enregistrée (montant, numéro marchand, date limite), rappel de paiement, paiement reçu, commande expédiée / prête / livrée, annulation. Textes sans accents de 160 caractères au plus (un seul SMS facturé). Désactivables avec `SMS_ORDER_NOTIFICATIONS=false`

## Emails transactionnels

- E-mail de confirmation de commande envoyé au client (récapitulatif, instructions de paiement MVola)
- E-mail de notification envoyé à l'administrateur pour chaque nouvelle commande
- E-mail d'annulation envoyé au client lorsqu'une commande est annulée depuis l'admin, avec le motif d'annulation saisi par l'administrateur
- Envoi asynchrone (n'impacte pas le temps de réponse du checkout / de la mise à jour de statut)

## Relances automatiques

Tâches récurrentes (file BullMQ sur Redis, voir ARCHITECTURE.md, règle 9). Chaque relance n'est envoyée qu'une fois.

- Rappel de paiement au client avant l'annulation automatique d'une commande non payée (un seul rappel par panier multi-vendeurs, nouveau rappel après un paiement refusé)
- Alerte au vendeur pour toute commande payée non expédiée dans le délai (compté depuis la disponibilité pour une précommande), avec un récapitulatif à l'administrateur
- Alerte de stock bas au vendeur (à l'administrateur pour les produits de la plateforme), réarmée quand le stock remonte

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
