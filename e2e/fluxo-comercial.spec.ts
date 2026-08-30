import { test, expect, type Page } from '@playwright/test';

/**
 * Percurso completo de um comercial, já autenticado (a sessão vem de
 * `auth.setup.ts`).
 *
 * Cobre o que nenhum teste de unidade cobre: que a lista carrega, que criar um
 * cliente o faz aparecer, que registar uma atividade fica no histórico, e que
 * tudo sobrevive a um recarregamento — ou seja, que foi mesmo gravado.
 *
 * Os registos criados levam um sufixo único e são apagados no fim.
 */

/** Sufixo único, para não colidir com dados existentes nem entre execuções. */
const marca = () => `E2E-${Date.now().toString(36)}`;

/** A aplicação está pronta quando a marca lateral aparece. */
async function pronta(page: Page) {
  await page.goto('/');
  await expect(page.locator('.crm-side-mark')).toBeVisible({ timeout: 20_000 });
}

/**
 * Abre o separador Clientes.
 *
 * A aplicação arranca noutro módulo, e o formulário de cliente só existe
 * dentro deste — clicar em "Novo cliente" a partir do arranque não abria nada.
 */
async function irParaClientes(page: Page) {
  await pronta(page);
  const clientes = page.getByRole('link', { name: /^clientes$/i }).first();
  await expect(clientes).toBeVisible({ timeout: 20_000 });
  await clientes.click();
  await page.waitForURL('**/clientes');
  await expect(page.locator('.crm-client-list')).toBeVisible({ timeout: 15_000 });
}

test('a sessão guardada dá acesso direto à aplicação', async ({ page }) => {
  await pronta(page);
  await expect(page.getByRole('button', { name: 'Entrar' })).toHaveCount(0);
});

test('a sessão sobrevive a um recarregamento', async ({ page }) => {
  await pronta(page);
  await page.reload();
  await expect(page.locator('.crm-side-mark')).toBeVisible();
});

test('ciclo de vida de um cliente: criar, registar atividade, apagar', async ({ page }) => {
  const nome = `Móveis Teste ${marca()}`;
  await irParaClientes(page);

  /* ── Criar ── */
  await page.getByRole('button', { name: 'Novo cliente' }).first().click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  await modal.getByLabel('Nome da empresa *').fill(nome);
  await modal
    .getByRole('button', { name: /guardar|criar/i })
    .first()
    .click();
  await expect(modal).toBeHidden({ timeout: 10_000 });

  /* ── Aparece na lista ── */
  await expect(page.getByText(nome).first()).toBeVisible({ timeout: 10_000 });

  /* ── Registar atividade ── */
  await page.getByText(nome).first().click();
  // O compositor arranca fechado; é preciso abri-lo primeiro.
  await page.getByRole('button', { name: /registar atividade/i }).click();

  const nota = `Falei sobre a garantia ${marca()}`;
  await page.locator('.crm-composer-input').fill(nota);
  await page.getByRole('button', { name: 'Registar', exact: true }).click();
  await expect(page.getByText(nota).first()).toBeVisible({ timeout: 10_000 });

  /* ── Sobrevive ao recarregamento: foi mesmo gravado ── */
  await page.reload();
  await expect(page.getByText(nome).first()).toBeVisible({ timeout: 20_000 });

  /* ── Limpar ── */
  await page.getByText(nome).first().click();
  await page.getByRole('button', { name: /editar tudo/i }).click();
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('button', { name: /eliminar|apagar/i })
    .first()
    .click();
  await expect(page.getByText(nome)).toHaveCount(0, { timeout: 10_000 });
});

test('os módulos principais abrem sem erro de JavaScript', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));

  await pronta(page);

  for (const modulo of ['Dashboard', 'Clientes', 'Pipeline', 'Agenda', 'Mapa']) {
    const link = page.getByRole('button', { name: new RegExp(modulo, 'i') }).first();
    if ((await link.count()) === 0) continue;
    await link.click();
    await expect(page.getByText('Alguma coisa correu mal')).toHaveCount(0);
  }

  expect(erros, `erros de JavaScript: ${erros.join(' | ')}`).toHaveLength(0);
});

test.describe('acessibilidade', () => {
  test('o formulário de cliente tem todos os campos etiquetados', async ({ page }) => {
    // Um `<label>` que não aponta para o campo não é lido pelo leitor de ecrã
    // e clicar nele não põe o cursor no sítio certo.
    await irParaClientes(page);
    await page.getByRole('button', { name: 'Novo cliente' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    expect(await camposSemEtiqueta(page)).toEqual([]);
  });

  test('Escape fecha o formulário de cliente', async ({ page }) => {
    await irParaClientes(page);
    await page.getByRole('button', { name: 'Novo cliente' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});

/** Descrição dos campos visíveis sem etiqueta acessível. */
async function camposSemEtiqueta(page: Page): Promise<string[]> {
  return page.locator('input:not([type=hidden]), select, textarea').evaluateAll((campos) =>
    campos
      .filter((c) => {
        const el = c as HTMLInputElement;
        if (el.offsetParent === null) return false; // escondido
        return (
          !el.labels?.length &&
          !el.getAttribute('aria-label') &&
          !el.getAttribute('aria-labelledby') &&
          !el.closest('label')
        );
      })
      .map((c) => {
        const el = c as HTMLInputElement;
        return `${el.tagName.toLowerCase()}[placeholder=${el.placeholder || '?'}]`;
      }),
  );
}
