import { BlogPost } from '@/types';

// Articles du blog, repris du template ShopWise (assets/js/blog.js).
export const blogPosts: BlogPost[] = [
  {
    id: '1',
    title: 'Bien choisir son sac en cuir : le guide complet',
    slug: 'choisir-un-sac-en-cuir',
    excerpt: 'Pleine fleur, tannage végétal, coutures… Les critères qui font la différence entre un sac qui dure deux saisons et un sac qui vous accompagne dix ans.',
    content: `Un beau sac en cuir est un investissement. Pour qu'il vous accompagne longtemps, quelques critères simples permettent de repérer la qualité avant l'achat.

## 1. Le type de cuir

Le cuir pleine fleur conserve la surface naturelle de la peau : il est le plus résistant et se patine joliment. Le cuir « fleur corrigée » est poncé puis recouvert d'un film, plus uniforme mais moins durable.

## 2. Le tannage

- Tannage végétal : aspect naturel, belle patine, plus écologique
- Tannage au chrome : plus souple et plus rapide, mais moins noble
- Demandez toujours l'origine du cuir et du tannage

## 3. Les finitions

Observez les coutures (régulières et serrées), les bords (peints ou cirés, jamais effilochés) et la quincaillerie : un zip métallique et des anneaux en laiton vieillissent bien mieux que le plastique.

> Un bon sac se reconnaît autant à ses finitions intérieures qu'à son extérieur.

## 4. L'entretien

Dépoussiérez-le régulièrement avec un chiffon doux, nourrissez le cuir tous les six mois et rangez-le rembourré, dans sa housse en coton.`,
    coverImage: '/shopwise/img/blog/product-details-3.webp',
    category: 'conseils',
    publishedAt: '2026-09-12',
    author: { name: 'Camille Laurent', role: 'Acheteuse maroquinerie', avatar: '' },
    tags: ['cuir', 'maroquinerie', 'guide'],
    readingTime: 5,
  },
  {
    id: '2',
    title: 'Les tendances mode de l\'automne 2026',
    slug: 'tendances-automne-2026',
    excerpt: 'Tons terre, matières douces et silhouettes structurées : tour d\'horizon des pièces qui vont compter cette saison.',
    content: `Cet automne, la mode mise sur la simplicité et la qualité : des pièces faciles à associer, pensées pour durer.

## Les couleurs de la saison

- Camel et cognac, en total look ou par touches
- Vert olive et kaki pour les vestes
- Bordeaux profond en accessoire

## Les pièces clés

La veste structurée en laine, le pull en maille épaisse et la botte en cuir lisse forment le trio de base. On les associe à un sac de taille moyenne, porté à l'épaule.

> Investir dans quelques belles pièces plutôt que dans beaucoup de pièces moyennes.

Retrouvez notre sélection de la saison dans la collection automne de la boutique.`,
    coverImage: '/shopwise/img/blog/product-m-8.webp',
    category: 'tendances',
    publishedAt: '2026-09-02',
    author: { name: 'Inès Moreau', role: 'Styliste', avatar: '' },
    tags: ['mode', 'automne', 'tendances'],
    readingTime: 4,
  },
  {
    id: '3',
    title: 'Livraison et retours : tout ce qu\'il faut savoir',
    slug: 'livraison-et-retours',
    excerpt: 'Délais, frais, suivi de colis et retours gratuits sous 45 jours : les réponses aux questions que vous nous posez le plus souvent.',
    content: `Chez ShopWise, nous voulons que chaque commande se passe simplement, de la validation du panier jusqu'à la réception.

## Les délais de livraison

- Standard : 2 à 4 jours ouvrés (4,99 €)
- Express : livraison le lendemain avant 13 h (11,99 €)
- Gratuite dès 75 € d'achat

## Suivre votre colis

Dès l'expédition, vous recevez un e-mail avec votre numéro de suivi. Vous pouvez aussi suivre votre commande depuis votre compte.

## Retourner un article

Vous disposez de 45 jours pour retourner un article non porté, dans son emballage d'origine. Le retour est gratuit et le remboursement intervient sous 5 jours après réception.`,
    coverImage: '/shopwise/img/blog/product-showcase-2.webp',
    category: 'guides',
    publishedAt: '2026-08-20',
    author: { name: 'Équipe ShopWise', role: 'Service client', avatar: '' },
    tags: ['livraison', 'retours', 'service client'],
    readingTime: 3,
  },
  {
    id: '4',
    title: '5 astuces pour garder vos baskets comme neuves',
    slug: 'entretenir-ses-baskets',
    excerpt: 'Toile, cuir ou daim : des gestes simples pour prolonger la vie de vos sneakers préférées.',
    content: `Des baskets bien entretenues durent deux fois plus longtemps. Voici nos cinq réflexes.

## Nos 5 astuces

- Imperméabilisez-les dès l'achat
- Brossez les semelles après chaque sortie sous la pluie
- Lavez les lacets à part, à la main
- Laissez-les sécher loin d'une source de chaleur
- Alternez deux paires pour laisser la mousse reprendre sa forme

> Le daim ne se mouille jamais : on le brosse à sec, toujours dans le même sens.

Pour le cuir, un lait nourrissant appliqué une fois par mois suffit à éviter les craquelures.`,
    coverImage: '/shopwise/img/blog/product-11.webp',
    category: 'conseils',
    publishedAt: '2026-08-05',
    author: { name: 'Thomas Girard', role: 'Responsable chaussures', avatar: '' },
    tags: ['chaussures', 'entretien', 'astuces'],
    readingTime: 3,
  },
  {
    id: '5',
    title: 'Notre démarche responsable en 2026',
    slug: 'notre-demarche-responsable',
    excerpt: 'Emballages recyclés, transport optimisé, programme de reprise : où en sont nos engagements et ce qui change cette année.',
    content: `Depuis nos débuts, nous essayons de réduire l'impact de chaque commande. Voici où nous en sommes.

## Ce que nous avons fait

- 100 % de nos colis en carton recyclé et sans plastique
- Regroupement des expéditions pour limiter les trajets
- Sélection prioritaire de marques certifiées

## Ce qui arrive cette année

Nous lançons un programme de reprise : rapportez un article usé de la boutique, nous le faisons réparer ou recycler et vous recevez un bon d'achat.

> Le produit le plus durable est celui que l'on garde longtemps.`,
    coverImage: '/shopwise/img/blog/about-wide-3.webp',
    category: 'actualites',
    publishedAt: '2026-07-18',
    author: { name: 'Équipe ShopWise', role: 'Direction', avatar: '' },
    tags: ['engagements', 'environnement', 'actualités'],
    readingTime: 4,
  },
];

export function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}
