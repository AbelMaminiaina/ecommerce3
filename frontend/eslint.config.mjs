import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

// ESLint 9 (configuration « flat ») : Next.js 16 ne fournit plus `next lint`, on lance `eslint .`
export default defineConfig([
  ...nextVitals,
  {
    rules: {
      '@next/next/no-img-element': 'off',
      // Règles du React Compiler (eslint-plugin-react-hooks 7, arrivées avec Next 16). Le site n'utilise pas le
      // compilateur : ces règles signalent des motifs existants qui fonctionnent (fonction déclarée après l'effet
      // qui l'appelle, état « hydraté » posé dans un effet…). Avertissements, comme avant la migration.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts']),
]);
