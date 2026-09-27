import { useEffect, useState } from 'react';

/** Valeur mise à jour après une pause de frappe (évite un appel à l'API par lettre) */
export function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
