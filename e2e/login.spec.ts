import { test, expect } from '@playwright/test';

/**
 * Testes do próprio login — arrancam sem sessão (projeto `login`, sem
 * `storageState`). São os únicos que fazem autenticação a sério; os restantes
 * reutilizam a sessão criada por `auth.setup.ts`.
 */

import { EMAIL, PASSWORD } from './credenciais';

test('sem sessão, mostra o ecrã de login', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});

test('credenciais erradas mostram erro e não entram', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill('password-errada');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.locator('.crm-login-error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});

test('o login é utilizável só com teclado', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.type(EMAIL); // o campo de email tem autoFocus
  await page.keyboard.press('Tab');
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Enter');

  await expect(page.getByRole('button', { name: 'Entrar' })).toBeHidden({ timeout: 20_000 });
});

test('a página declara o idioma', async ({ page }) => {
  // Sem isto, um leitor de ecrã lê português com pronúncia inglesa.
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', /pt/);
});

test('os campos do login têm etiqueta associada', async ({ page }) => {
  await page.goto('/');
  const semEtiqueta = await page.locator('input:not([type=hidden])').evaluateAll(
    (inputs) =>
      inputs.filter((i) => {
        const el = i as HTMLInputElement;
        return !el.labels?.length && !el.getAttribute('aria-label');
      }).length,
  );
  expect(semEtiqueta).toBe(0);
});
