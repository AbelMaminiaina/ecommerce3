import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

// Stockage non sensible (panier, e-mails des commandes sans compte). Les jetons vont dans expo-secure-store.
export const persistStorage = createJSONStorage(() => AsyncStorage);
