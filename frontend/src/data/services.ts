import { Service, FAQItem } from '@/types';

export const services: Service[] = [
  {
    id: 'livraison',
    title: 'Livraison à Antananarivo et environs',
    slug: 'livraison',
    description: 'Recevez vos commandes directement chez vous. Nous livrons dans toute la région d\'Antananarivo et ses environs.',
    longDescription: `Notre service de livraison vous permet de recevoir vos commandes professionnelles sans vous déplacer, avec un suivi de bout en bout depuis votre espace client.

**Zones de livraison :**
- Antananarivo centre : livraison sous 24-48h
- Banlieue d'Antananarivo : livraison sous 48h
- Autres régions : nous consulter

**Frais de livraison :**
- Gratuit dès 100 000 Ar de sous-total
- Forfait standard ou express sinon, calculé au checkout
- Retrait sur place toujours gratuit

Chaque commande est accompagnée d'un suivi de statut consultable dans "Mes commandes".`,
    icon: 'Truck',
    features: [
      'Livraison sous 24-48h',
      'Gratuit dès 100 000 Ar de sous-total',
      'Suivi de commande dans l\'espace client',
      'Retrait sur place disponible',
      'Livraison express disponible',
    ],
    pricing: 'Gratuit dès 100 000 Ar / forfait sinon',
    available: true,
  },
  {
    id: 'paiement',
    title: 'Paiement Mobile Money',
    slug: 'paiement',
    description: 'Payez en ligne par MVola, Orange Money ou Airtel Money, avec ou sans compte. Votre commande est traitée dès que votre paiement est vérifié.',
    longDescription: `Le paiement se fait en ligne, par Mobile Money, au moment de la commande. Il est demandé à tous les clients : particuliers, entreprises et visiteurs sans compte.

**Comment ça marche :**
1. Vous choisissez votre opérateur (MVola, Orange Money ou Airtel Money) en validant votre commande
2. Nous vous indiquons le montant exact et le numéro à créditer
3. Vous envoyez le montant depuis votre téléphone puis saisissez la référence de la transaction reçue par SMS
4. Notre équipe vérifie le paiement et vous prévient par e-mail : votre commande est alors traitée

**À savoir :**
- Un seul paiement couvre toutes les commandes d'un même panier, même de plusieurs vendeurs
- Une commande non payée sous 48 h est annulée automatiquement : le stock est alors libéré pour les autres clients
- Si un paiement ne peut pas être validé, vous en connaissez le motif et pouvez saisir une nouvelle référence
- Suivez l'état de votre paiement à tout moment dans « Suivi de commande »
- Le paiement par carte bancaire n'est pas encore disponible`,
    icon: 'CreditCard',
    features: [
      'MVola, Orange Money, Airtel Money',
      'Aucun compte nécessaire',
      'Vérification du paiement par notre équipe',
      'Confirmation par e-mail',
    ],
    pricing: 'Aucun frais ajouté par la plateforme',
    available: true,
  },
  {
    id: 'compte-pro',
    title: 'Compte professionnel',
    slug: 'compte-pro',
    description: 'Inscrivez votre entreprise, faites valider votre compte par notre équipe, et accédez à nos tarifs dégressifs par quantité.',
    longDescription: `L'accès à notre catalogue et à nos tarifs est réservé aux entreprises disposant d'un compte approuvé.

**Étapes d'inscription :**
1. Renseignez les informations de votre entreprise (raison sociale, numéro fiscal, contact)
2. Créez le compte du premier utilisateur administrateur
3. Notre équipe valide votre dossier sous 1 à 2 jours ouvrés
4. Vous recevez un e-mail de confirmation dès que votre compte est approuvé

**Une fois approuvé :**
- Accès aux prix et aux paliers de quantité sur tout le catalogue
- Passage de commande au tarif de gros, paiement par Mobile Money
- Publication de vos produits (validés par notre équipe) et suivi des commandes reçues
- Suivi des commandes et des paiements dans votre espace client`,
    icon: 'Building2',
    features: [
      'Validation sous 1-2 jours ouvrés',
      'Accès aux tarifs dégressifs',
      'Un ou plusieurs utilisateurs par entreprise',
      'Publication de vos produits',
    ],
    pricing: 'Inscription gratuite',
    available: true,
  },
  {
    id: 'support',
    title: 'Support & conseils',
    slug: 'support',
    description: 'Une question sur une commande, un paiement ou un produit ? Notre équipe accompagne les entreprises clientes de Tsena Pro.',
    longDescription: `Nous accompagnons nos clients professionnels à chaque étape, de l'inscription au suivi des commandes.

**Nos services de support :**

*Avant votre première commande :*
- Aide à l'inscription et à la constitution du dossier entreprise
- Explication des paliers de prix et quantités minimum

*Une fois client :*
- Suivi de commandes et de paiements
- Questions produits et disponibilité
- Demandes de tarifs pour de gros volumes

**Contact :**
- Par email ou téléphone, du lundi au samedi
- Réponse sous 24h ouvrées en moyenne`,
    icon: 'MessageCircle',
    features: [
      'Accompagnement à l\'inscription',
      'Support commandes et paiements',
      'Réponse sous 24h ouvrées',
      'Demandes de tarifs volumes',
    ],
    pricing: 'Inclus pour tous les comptes approuvés',
    available: true,
  },
];

export const faqItems: FAQItem[] = [
  {
    id: '1',
    question: 'Comment créer un compte professionnel sur Tsena Pro ?',
    answer: 'Rendez-vous sur la page "Devenir client professionnel", renseignez les informations de votre entreprise (raison sociale, numéro fiscal, contact) ainsi que celles du premier utilisateur. Notre équipe valide ensuite votre dossier sous 1 à 2 jours ouvrés.',
    category: 'compte',
  },
  {
    id: '2',
    question: 'Combien de temps prend la validation de mon compte ?',
    answer: 'La validation prend généralement 1 à 2 jours ouvrés. Vous recevez un e-mail de confirmation dès que votre compte est approuvé.',
    category: 'compte',
  },
  {
    id: '3',
    question: 'Qu\'est-ce que la quantité minimum de commande (MOQ) ?',
    answer: 'Chaque produit a une quantité minimum de commande, indiquée sur sa fiche produit (par exemple 25 cartons ou 6 rouleaux). Impossible de commander en dessous de ce seuil, propre à la vente en gros.',
    category: 'commande',
  },
  {
    id: '4',
    question: 'Comment fonctionnent les tarifs dégressifs ?',
    answer: 'Chaque produit peut avoir plusieurs paliers de prix : plus la quantité commandée est élevée, plus le prix unitaire baisse. Les paliers sont affichés directement sur la fiche produit.',
    category: 'commande',
  },
  {
    id: '5',
    question: 'Comment payer ma commande ?',
    answer: 'Le paiement se fait en ligne par Mobile Money (MVola, Orange Money ou Airtel Money). Après avoir validé votre commande, vous envoyez le montant indiqué au numéro affiché puis saisissez la référence de la transaction. Notre équipe vérifie le paiement et votre commande est traitée. Le paiement par carte bancaire n\'est pas encore disponible.',
    category: 'facturation',
  },
  {
    id: '6',
    question: 'Comment suivre l\'état de mon paiement ?',
    answer: 'Depuis « Suivi de commande » : connecté, vous retrouvez toutes vos commandes ; sans compte, saisissez le numéro de commande et l\'e-mail utilisé. Vous y voyez si le paiement est en attente, en cours de vérification ou confirmé.',
    category: 'facturation',
  },
  {
    id: '7',
    question: 'Quelles sont les zones de livraison ?',
    answer: 'Nous livrons à Antananarivo et ses environs. Le retrait sur place est également disponible gratuitement. Pour les autres régions, contactez-nous pour vérifier la faisabilité.',
    category: 'livraison',
  },
  {
    id: '8',
    question: 'Que faire si un produit reçu est non conforme ?',
    answer: 'Contactez-nous dans les 48h suivant la réception avec des photos du produit concerné. Nous étudierons un avoir ou un remplacement selon la situation.',
    category: 'general',
  },
];
