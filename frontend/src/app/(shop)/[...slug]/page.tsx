import { notFound } from 'next/navigation';

// Toute URL inconnue est rendue par (shop)/not-found.tsx, dans le layout de la boutique.
export default function CatchAll() {
  notFound();
}
