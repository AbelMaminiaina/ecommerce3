# Tsena Pro - Site Web E-commerce

Site web moderne et chaleureux pour une ferme avicole biologique spécialisée dans la vente d'œufs frais, de poules pondeuses et de produits pour basse-cour.

## Stack Technique

### Frontend
- **Framework**: Next.js 14+ (App Router) avec React 18+ et TypeScript
- **Styling**: Tailwind CSS pour le design responsive
- **Animations**: Framer Motion pour des transitions fluides
- **Icônes**: Lucide React
- **Formulaires**: React Hook Form avec Zod pour la validation
- **État global**: Zustand pour le panier (avec persistance localStorage)
- **Images**: Next/Image pour l'optimisation automatique

### Backend
- **API Routes**: Next.js API Routes
- **Validation**: Zod
- **Paiement**: Prêt pour intégration Stripe (à configurer)
- **Email**: Prêt pour Nodemailer/SendGrid (à configurer)

## Installation

```bash
# Cloner le repository
git clone <repository-url>
cd ecommerce3

# Installer les dépendances
npm install

# Copier le fichier d'environnement
cp .env.local.example .env.local

# Lancer le serveur de développement
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000) dans votre navigateur.

## Structure du Projet

```
ecommerce3/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Layout principal
│   │   ├── page.tsx                  # Page d'accueil
│   │   ├── globals.css               # Styles globaux
│   │   ├── produits/
│   │   │   ├── page.tsx              # Liste des produits
│   │   │   └── [slug]/page.tsx       # Détail produit
│   │   ├── nos-poules/page.tsx       # Galerie des races
│   │   ├── services/page.tsx         # Services proposés
│   │   ├── notre-elevage/page.tsx    # Présentation de la ferme
│   │   ├── contact/page.tsx          # Formulaire de contact
│   │   ├── blog/
│   │   │   ├── page.tsx              # Liste des articles
│   │   │   └── [slug]/page.tsx       # Article de blog
│   │   ├── panier/page.tsx           # Panier
│   │   ├── mentions-legales/page.tsx
│   │   ├── politique-confidentialite/page.tsx
│   │   ├── cgv/page.tsx
│   │   └── api/                       # API Routes
│   │       ├── products/route.ts
│   │       ├── contact/route.ts
│   │       ├── newsletter/route.ts
│   │       └── checkout/route.ts
│   ├── components/
│   │   ├── ui/                        # Composants UI réutilisables
│   │   │   ├── Button.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Textarea.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Checkbox.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Accordion.tsx
│   │   │   ├── Toast.tsx
│   │   │   └── index.ts
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   └── Footer.tsx
│   │   ├── home/
│   │   │   ├── Hero.tsx
│   │   │   ├── Story.tsx
│   │   │   ├── Values.tsx
│   │   │   ├── Testimonials.tsx
│   │   │   ├── FeaturedProducts.tsx
│   │   │   └── CTASection.tsx
│   │   ├── products/
│   │   │   ├── ProductCard.tsx
│   │   │   ├── ProductFilter.tsx
│   │   │   └── ProductGrid.tsx
│   │   └── cart/
│   │       └── CartDrawer.tsx
│   ├── lib/
│   │   ├── utils.ts                   # Fonctions utilitaires
│   │   └── animations.ts              # Variantes Framer Motion
│   ├── data/
│   │   ├── products.ts                # Données des produits
│   │   ├── chickens.ts                # Races de poules
│   │   ├── testimonials.ts            # Témoignages
│   │   ├── services.ts                # Services et FAQ
│   │   └── blog.ts                    # Articles de blog
│   ├── hooks/
│   │   ├── useCart.ts                 # Store Zustand pour le panier
│   │   └── useMediaQuery.ts           # Hook responsive
│   └── types/
│       └── index.ts                   # Types TypeScript
├── public/
│   └── images/                        # Images statiques
├── .env.local.example                 # Variables d'environnement
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## Pages du Site

### Page d'Accueil (`/`)
- Hero section avec slogan et CTAs
- Section "Nos Valeurs" avec 4 cartes
- Produits mis en avant
- Notre histoire avec storytelling
- Témoignages clients en carousel
- Section CTA avec infos de visite

### Page Produits (`/produits`)
- Filtres par catégorie (œufs frais, œufs fécondés, poules, accessoires)
- Grille de produits avec cartes interactives
- Badges (Bio, Plein air, Nouveau, Populaire)
- Ajout au panier direct

### Page Détail Produit (`/produits/[slug]`)
- Galerie d'images
- Description complète
- Caractéristiques
- Sélecteur de quantité
- Produits similaires

### Page Nos Poules (`/nos-poules`)
- Galerie des 8 races de poules
- Fiche détaillée en modal pour chaque race
- Indicateur de productivité
- Couleur des œufs

### Page Services (`/services`)
- 4 services : Livraison, Location, Conseils
- FAQ en accordéon
- Tarifs et conditions

### Page Notre Élevage (`/notre-elevage`)
- Présentation de la méthode bio
- Certifications (AB, Bio européen)
- Galerie photos
- Carte interactive

### Page Contact (`/contact`)
- Formulaire de contact avec validation
- Informations de contact
- Liens réseaux sociaux
- Carte Google Maps

### Page Blog (`/blog`)
- Liste des articles filtrables par catégorie
- Article mis en avant
- Grille d'articles

### Page Panier (`/panier`)
- Liste des articles avec quantités modifiables
- Code promo
- Récapitulatif de commande
- Bouton de checkout

### Pages Légales
- Mentions légales
- Politique de confidentialité (RGPD)
- CGV avec politique de livraison

## Configuration

### Variables d'Environnement

Créer un fichier `.env.local` à la racine :

```env
# Application
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_NAME="Tsena Pro"

# Stripe (pour le paiement)
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
CONTACT_EMAIL=savatry.milamina@gmail.com

# Google Maps
NEXT_PUBLIC_GOOGLE_MAPS_KEY=your-google-maps-api-key
```

### Personnalisation

#### Couleurs (tailwind.config.ts)
```typescript
colors: {
  prairie: { /* Vert principal */ },
  terre: { /* Ocre/jaune */ },
  warm: { /* Tons neutres chauds */ },
  cream: { /* Fond crème */ },
}
```

#### Polices
- **Display** (titres): Playfair Display
- **Sans** (corps): Inter

## Développement

### Scripts

```bash
# Développement
npm run dev

# Build production
npm run build

# Démarrer en production
npm start

# Linting
npm run lint
```

### Ajout d'un Produit

Éditer `src/data/products.ts` :

```typescript
{
  id: 'nouveau-produit',
  name: 'Nom du produit',
  slug: 'nom-du-produit',
  category: 'oeufs-frais', // ou 'oeufs-fecondes', 'poules', 'accessoires'
  description: 'Description complète...',
  shortDescription: 'Description courte',
  price: 9.90,
  images: ['/images/products/image.jpg'],
  inStock: true,
  badges: ['bio', 'plein-air'],
  // ...
}
```

### Ajout d'une Race de Poule

Éditer `src/data/chickens.ts` :

```typescript
{
  id: 'nouvelle-race',
  name: 'Nom de la Race',
  slug: 'nom-de-la-race',
  image: '/images/chickens/race.jpg',
  eggColor: 'Couleur des œufs',
  eggColorHex: '#HEXCODE',
  temperament: 'Calme et docile',
  productivity: 'élevée',
  productivityNumber: 80,
  eggsPerYear: '200-250',
  // ...
}
```

## Fonctionnalités à Implémenter

### En Production

1. **Intégration Stripe**
   - Configurer les clés API dans `.env.local`
   - Décommenter le code dans `src/app/api/checkout/route.ts`
   - Créer la page de succès de commande

2. **Envoi d'Emails**
   - Configurer SMTP ou SendGrid
   - Décommenter le code dans `src/app/api/contact/route.ts`

3. **Base de Données**
   - Ajouter Prisma avec PostgreSQL ou MongoDB avec Mongoose
   - Migrer les données statiques vers la BDD
   - Ajouter un système d'authentification admin

4. **Newsletter**
   - Intégrer Mailchimp ou autre service
   - Configurer dans `src/app/api/newsletter/route.ts`

5. **Images**
   - Remplacer les images placeholder par de vraies photos
   - Configurer Cloudinary ou AWS S3 pour l'hébergement

### Améliorations Futures

- [ ] Espace client avec historique de commandes
- [ ] Système d'avis produits
- [ ] Chat en direct
- [ ] Mode sombre
- [ ] PWA pour mobile
- [ ] Système de réservation en ligne pour les visites
- [ ] Tableau de bord admin

## Déploiement

### Vercel (Recommandé)

```bash
# Installer Vercel CLI
npm i -g vercel

# Déployer
vercel
```

### Autres Plateformes

Le site peut être déployé sur :
- Netlify
- AWS Amplify
- Railway
- DigitalOcean App Platform

## Support

Pour toute question ou problème :
- Email : savatry.milamina@gmail.com
- Téléphone : 01 23 45 67 89

## Licence

Propriétaire - Tsena Pro © 2024
