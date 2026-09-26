import { PageSkeleton } from '@/components/shop/Skeletons';

// Affiché instantanément au clic, pendant que le serveur prépare la page (en-tête et pied de page restent en place)
export default function Loading() {
  return <PageSkeleton />;
}
