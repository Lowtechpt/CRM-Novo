import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `setupFiles` corre antes de os módulos da app serem importados — é o que
    // garante que TURSO_URL aponta à base temporária e não à real.
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    // Os testes partilham uma base SQLite; em paralelo bloqueavam-se uns aos
    // outros. A suite é pequena, o custo de ser sequencial é irrelevante.
    fileParallelism: false,
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/test/**', 'src/**/*.test.ts', 'src/seed.ts'],
      // Limiares um pouco abaixo do valor atual: servem de travão a regressões,
      // não de meta a perseguir. Subir só depois de a cobertura real subir.
      thresholds: {
        lines: 84,
        statements: 80,
        functions: 76,
        branches: 60,
      },
    },
  },
});
