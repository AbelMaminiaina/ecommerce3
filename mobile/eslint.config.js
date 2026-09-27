// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

// Couches de l'application (voir ARCHITECTURE-MOBILE.md §3). Chaque couche n'importe que les couches en dessous :
//   app/ (écrans)  →  features/ (domaines : données, états, composants métier)
//                  →  components/ · hooks/ (génériques)  →  lib/ (infrastructure)  →  theme/ · @tsena/shared
const noUpwardImports = {
  'import/no-restricted-paths': [
    'error',
    {
      zones: [
        { target: './src/features', from: './src/app', message: 'Un domaine ne dépend pas des écrans.' },
        {
          target: ['./src/components', './src/hooks'],
          from: ['./src/app', './src/features'],
          message: 'Composants et hooks génériques : aucune dépendance au métier ni aux écrans.',
        },
        {
          target: './src/lib',
          from: ['./src/app', './src/features', './src/components', './src/hooks'],
          message: 'lib/ est l’infrastructure : elle ne dépend d’aucune couche au-dessus.',
        },
      ],
    },
  ],
};

// Les écrans passent par les hooks de features/ (ex. features/catalog/queries.ts) : jamais d'appel direct à l'API
// ni de clé de cache écrite à la main. Seul app/_layout.tsx installe le cache (QueryClient).
const screensUseFeatures = {
  'no-restricted-imports': [
    'error',
    {
      paths: [
        {
          name: '@tanstack/react-query',
          message: 'Écran : utilisez un hook de features/ (ex. useProduct) plutôt que useQuery / useMutation.',
        },
        {
          name: '@tsena/shared',
          importNames: ['authApi', 'catalogApi', 'ordersApi', 'paymentsApi', 'createApiClient'],
          message: 'Écran : les appels à l’API passent par un hook de features/.',
        },
      ],
      patterns: [
        { group: ['**/lib/api', '**/lib/session'], message: 'Écran : passez par un hook de features/.' },
      ],
    },
  ],
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  { files: ['src/**/*.{ts,tsx}'], rules: noUpwardImports },
  { files: ['src/app/**/*.{ts,tsx}'], ignores: ['src/app/_layout.tsx'], rules: screensUseFeatures },
]);
