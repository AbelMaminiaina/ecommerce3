import { Suspense } from 'react';
import { Hero } from '@/components/shopwise/home/Hero';
import { PromoCards } from '@/components/shopwise/home/PromoCards';
import { BestSellers } from '@/components/shopwise/home/BestSellers';
import { ProductTabs } from '@/components/shopwise/home/ProductTabs';
import { ProOffer } from '@/components/shopwise/home/ProOffer';
import { getHomeData } from '@/components/shopwise/home/data';

// Les sections appellent le backend, injoignable depuis l'étape de build Docker isolée :
// rendu à chaque requête pour éviter le prérendu statique.
export const dynamic = 'force-dynamic';

async function HomeSections() {
  const data = await getHomeData();

  return (
    <>
      <Hero tiles={data.heroTiles} carousel={data.carousel} />
      <PromoCards categories={data.categories} />
      <BestSellers products={data.bestSellers} />
      <ProductTabs tabs={data.tabs} />
      <ProOffer products={data.offers} />
    </>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <>
          <Hero tiles={[]} carousel={[]} />
          <ProOffer products={[]} />
        </>
      }
    >
      <HomeSections />
    </Suspense>
  );
}
