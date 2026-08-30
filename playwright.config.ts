import { defineConfig, devices } from '@playwright/test';

/**
 * Testes ponta a ponta.
 *
 * Os testes de unidade e de rota provam que as peças funcionam; estes provam
 * que a aplicação funciona. Correm contra o backend e o frontend reais, num
 * browser real, pelo caminho que o utilizador percorre.
 *
 * A base de dados é a de desenvolvimento: os testes criam registos com um
 * prefixo próprio e limpam o que criaram.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
  },

  projects: [
    // Faz um único login e guarda a sessão em e2e/.auth/sessao.json.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    // Testes que verificam o próprio login: precisam de começar sem sessão.
    {
      name: 'login',
      testMatch: /login\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // Todo o resto arranca já autenticado.
    {
      name: 'chromium',
      /* `pwa.spec.ts` fica de fora: precisa do build de produção servido na
         porta 3002 (o service worker não existe em `vite dev`), e essa porta
         não é levantada por esta configuração.

         Consequência a assumir: esses três testes NÃO correm aqui nem no CI.
         Para os correr, servir o build em :3002 e depois
         `npx playwright test e2e/pwa.spec.ts --project=chromium`.
         Enquanto assim for, não contam como cobertura automática. */
      testIgnore: /(auth\.setup|login\.spec|pwa\.spec)\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/sessao.json',
      },
      dependencies: ['setup'],
    },
  ],

  // Arranca os dois servidores.
  webServer: [
    {
      command: 'npm --prefix backend run dev',
      url: 'http://127.0.0.1:3001/health',

      reuseExistingServer: false,
      timeout: 60_000,

      env: {
        ...process.env,

        TURSO_URL: 'file:e2e-test.db',
        TURSO_AUTH_TOKEN: '',

        ADMIN_EMAIL: process.env.E2E_EMAIL || 'e2e@exemplo.test',
        ADMIN_PASSWORD: process.env.E2E_PASSWORD || 'senha-efemera-de-teste',
        ADMIN_NAME: 'Admin E2E',

        /* A suite faz vários logins legítimos (o setup, mais os testes do
           próprio login). Com o limite de produção — 10 por 15 minutos — as
           execuções repetidas falhariam por 429 em vez de por defeito da app. */
        LOGIN_RATE_LIMIT: '200',
      },
    },
    {
      command: 'npm --prefix frontend run dev -- --host 127.0.0.1',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
