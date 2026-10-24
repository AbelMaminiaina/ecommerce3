'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { rememberReferral } from '@/lib/referral';

// Garde le code d'un lien de parrainage (?ref=…) reçu sur n'importe quelle page de la boutique
export function ReferralCapture() {
  const searchParams = useSearchParams();
  const ref = searchParams.get('ref');

  useEffect(() => {
    rememberReferral(ref);
  }, [ref]);

  return null;
}
