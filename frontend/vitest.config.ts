import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Só as fontes TypeScript. Sem isto, um .js compilado que escape ao
    // .gitignore faz a mesma suite correr duas vezes.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.js'],
  },
});
