# Tsena Pro

Plateforme de vente en gros (B2B) multi-vendeurs pour les professionnels à Madagascar : tarifs dégressifs, paiement par Mobile Money.

## Technologies

### Frontend
- **Next.js 14** - Framework React avec App Router
- **TypeScript** - Typage statique
- **Tailwind CSS** - Styling utilitaire
- **Framer Motion** - Animations
- **Zustand** - State management (panier)

### Backend
- **Express.js** - API REST
- **Prisma** - ORM
- **PostgreSQL** - Base de données
- **Redis** - Cache

### Infrastructure
- **Docker** - Conteneurisation
- **GitHub Actions** - CI/CD

## Installation

### Prérequis
- Node.js 18+
- Docker & Docker Compose
- Git

### Démarrage rapide

```bash
# Cloner le repository
git clone https://github.com/AbelMaminiaina/ecommerce3.git
cd ecommerce3

# Lancer les services Docker (PostgreSQL, Redis, pgAdmin)
docker-compose up -d

# Backend
cd backend
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev

# Frontend (dans un autre terminal)
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

### URLs locales
- **Frontend** : http://localhost:3000
- **Backend API** : http://localhost:3001
- **pgAdmin** : http://localhost:5050

## Structure du projet

> Les règles d'architecture à jour (dossiers, accès à l'API, validation, styles) sont dans
> [ARCHITECTURE.md](./ARCHITECTURE.md). L'arborescence ci-dessous est historique.

```
ecommerce3/
├── frontend/          # Application Next.js
│   ├── src/
│   │   ├── app/       # Pages (App Router)
│   │   ├── components/# Composants React
│   │   ├── lib/       # Utilitaires
│   │   ├── hooks/     # Hooks personnalisés
│   │   └── data/      # Données statiques
│   └── public/        # Assets statiques
├── backend/           # API Express
│   ├── src/
│   │   ├── routes/    # Routes API
│   │   └── lib/       # Prisma, Redis, Cache
│   └── prisma/        # Schema et migrations
├── docker/            # Scripts d'initialisation Docker
└── docker-compose.yml # Configuration Docker
```

## Déploiement

Mise en ligne sur le VPS Contabo (à côté des autres sites du serveur, accès par IP et lien HTTPS Cloudflare) :
voir [DEPLOY-DEMO.md](./DEPLOY-DEMO.md). En une commande depuis Windows : `.\scripts\deploy-demo.ps1 -Server IP_DU_VPS`.

## Scripts

### Frontend
```bash
npm run dev      # Développement
npm run build    # Build production
npm run start    # Démarrer en production
npm run lint     # Linter
```

### Backend
```bash
npm run dev        # Développement
npm run build      # Build
npm run start      # Production
npm run db:migrate # Migrations Prisma
npm run db:seed    # Seed database
npm run db:studio  # Prisma Studio
```

## Environnement

### Backend (.env)
```env
DATABASE_URL="postgresql://user:password@localhost:5434/tsenapro"
REDIS_URL="redis://:password@localhost:6380"
PORT=3001
FRONTEND_URL=http://localhost:3000
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

## Santé du Projet

**Score global : 6.5/10** - Préoccupations modérées

### Points positifs
- Architecture claire avec séparation frontend/backend
- Technologies modernes (TypeScript strict, Next.js 14, Prisma)
- Infrastructure Docker fonctionnelle (PostgreSQL + Redis)
- Pipeline CI/CD GitHub Actions (lint + build)

### Points à améliorer

| Priorité | Problème | Action |
|----------|----------|--------|
| Critique | Vulnérabilités npm | `npm audit fix` |
| Critique | APIs admin non protégées | Ajouter middleware auth |
| Haute | Fichiers .env suivis par git | Mettre à jour .gitignore |
| Moyenne | Pas d'ESLint backend | Configurer ESLint |
| Moyenne | Pas de rate limiting | Ajouter express-rate-limit |

### Checklist avant production

- [ ] Corriger les vulnérabilités de sécurité (`npm audit fix`)
- [ ] Ajouter authentification sur les endpoints admin
- [ ] Retirer les fichiers .env du suivi git
- [x] Écrire des tests unitaires (voir [FEATURES.md](./FEATURES.md#tests-unitaires))
- [x] Intégrer les tests au pipeline CI
- [ ] Configurer ESLint pour le backend
- [ ] Ajouter rate limiting sur les APIs
- [ ] Mettre en place la pagination sur les endpoints de liste
- [ ] Configurer un système de logging (Winston/Pino)

## Licence

Propriétaire - Tsena Pro
