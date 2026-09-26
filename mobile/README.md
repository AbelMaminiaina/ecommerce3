# Tsena Pro — application mobile (Android et iPhone)

Expo SDK 57 + Expo Router. Architecture et contrat API : [ARCHITECTURE-MOBILE.md](../ARCHITECTURE-MOBILE.md).
Le code métier (types, prix, validation, client API) vient de [`packages/shared`](../packages/shared).

## Démarrer

```bash
# à la racine du dépôt (workspaces npm : packages/* et mobile)
npm install

# adresse HTTPS du backend (tunnel Cloudflare en test, voir ARCHITECTURE-MOBILE.md §5)
cp mobile/.env.example mobile/.env.local   # puis renseigner EXPO_PUBLIC_API_URL

npm run dev:mobile                          # QR code à scanner avec Expo Go
```

## Vérifier

```bash
cd mobile
npx tsc --noEmit     # types
npx expo lint        # lint
npx expo-doctor      # dépendances et configuration
npm run test:shared  # (à la racine) tests du code partagé
```

## Organisation

| Dossier | Rôle |
|---|---|
| `src/app/(tabs)/` | Accueil · Catalogue · Panier · Compte |
| `src/app/produit/[slug].tsx` | Fiche produit |
| `src/app/commande/` | Commande (`index`) puis paiement et suivi (`[numero]`) |
| `src/app/auth/` | Connexion, inscription (particulier) |
| `src/app/compte/supprimer.tsx` | Suppression du compte (exigée par les stores) |
| `src/features/` | Session (`auth`), panier (`cart`), paiement (`payment`) |
| `src/components/` | Éléments d'interface |
| `src/lib/api.ts` | Client API, jetons dans expo-secure-store |

Règles reprises du site : quantité minimum, paliers dégressifs réservés aux entreprises approuvées, une commande
par vendeur, paiement Mobile Money obligatoire. Le serveur recalcule toujours les montants.

Ajouter un module : `npx expo install <paquet>` (jamais `npm install` seul, voir `../.npmrc`).
