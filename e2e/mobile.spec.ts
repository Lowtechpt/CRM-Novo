import { test, expect, devices } from '@playwright/test';

/**
 * Utilização em telemóvel.
 *
 * A grelha de clientes colapsava para uma coluna e empilhava lista e ficha:
 * era preciso rolar por vinte clientes para chegar ao detalhe do que se tinha
 * escolhido, e não havia forma de voltar. Estes testes fixam o padrão
 * lista-detalhe que qualquer app móvel usa.
 */
/* Telemóvel com motor Chromium, não `iPhone 13`.
   O descritor do iPhone força o WebKit, que no Windows não arranca de forma
   fiável — estes oito testes falhavam com `browser has been closed` na máquina
   de quem programa, e só corriam no CI. O que se verifica aqui é layout e
   toque (padrão lista-detalhe, botão de voltar, sem rolamento horizontal,
   tamanho dos alvos), não o motor de renderização: um ecrã de 393px com toque
   exercita o mesmo, e passa a correr em todo o lado. */
test.use({ ...devices['Pixel 5'] });

async function abrirClientes(page: import('@playwright/test').Page) {
  await page.goto('/');
  // Esperar pelo proprio link, nao so pela marca: a marca aparece no primeiro
  // render e a app volta a renderizar quando a sessao e os dados chegam. Uma
  // execucao completa apanhou essa janela e o clique expirou.
  const clientes = page.getByRole('link', { name: /^clientes$/i }).first();
  await expect(clientes).toBeVisible({ timeout: 20000 });
  await clientes.click();
  // Com rotas reais o fim da navegacao e observavel, em vez de adivinhado.
  await page.waitForURL('**/clientes');
  await expect(page.locator('.crm-client-list')).toBeVisible({ timeout: 15000 });
}

test('a lista aparece e a ficha está escondida', async ({ page }) => {
  await abrirClientes(page);
  await expect(page.locator('.crm-client-list')).toBeVisible();
  await expect(page.locator('.crm-detail')).toBeHidden();
});

test('escolher um cliente abre a ficha em ecrã inteiro', async ({ page }) => {
  await abrirClientes(page);
  await page.locator('.crm-list-item').first().click();
  await page.waitForTimeout(500);

  await expect(page.locator('.crm-detail')).toBeVisible();
  await expect(page.locator('.crm-client-list')).toBeHidden();
  // O nome do cliente tem de estar visível sem rolar.
  await expect(page.locator('.crm-detail-name')).toBeInViewport();
});

test('o botão voltar devolve à lista', async ({ page }) => {
  await abrirClientes(page);
  await page.locator('.crm-list-item').first().click();
  await page.waitForTimeout(400);

  await page.getByRole('button', { name: 'Voltar à lista' }).click();
  await expect(page.locator('.crm-client-list')).toBeVisible();
  await expect(page.locator('.crm-detail')).toBeHidden();
});

test('o botão do telemóvel fecha a ficha em vez de sair da app', async ({ page }) => {
  await abrirClientes(page);
  await page.locator('.crm-list-item').first().click();
  await page.waitForTimeout(400);

  await page.goBack();
  await page.waitForTimeout(400);
  await expect(page.locator('.crm-client-list')).toBeVisible();
});

test('não há rolamento horizontal em nenhuma das vistas', async ({ page }) => {
  await abrirClientes(page);
  const transborda = () =>
    page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

  expect(await transborda(), 'lista transborda').toBe(false);
  await page.locator('.crm-list-item').first().click();
  await page.waitForTimeout(500);
  expect(await transborda(), 'ficha transborda').toBe(false);
});

test('as associações continuam acessíveis em telemóvel', async ({ page }) => {
  // Antes eram escondidas em ecrã estreito; são a informação mais consultada
  // depois da timeline.
  await abrirClientes(page);
  await page.locator('.crm-list-item').first().click();
  await page.waitForTimeout(500);
  await expect(page.locator('.crm-record-col.rel')).toBeVisible();
});

test('nada transborda o carril lateral nem o cabeçalho', async ({ page }) => {
  /**
   * O botão "Registar / Ditar" mantinha a etiqueta em ecrã estreito e o texto
   * saía do carril de 54px, por cima do conteúdo. O mesmo com a pesquisa, que
   * comia metade da barra com um atalho de teclado que num telemóvel não
   * existe.
   */
  await abrirClientes(page);

  const transbordos = await page.evaluate(() => {
    const maus: string[] = [];
    const carril = document.querySelector('.crm-sidebar')!.getBoundingClientRect();
    document.querySelectorAll('.crm-sidebar *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      if (r.right > carril.right + 1) {
        maus.push(
          `${String((el as HTMLElement).className).slice(0, 30)} sai ${Math.round(r.right - carril.right)}px`,
        );
      }
    });
    return [...new Set(maus)];
  });

  expect(transbordos).toEqual([]);
});

test('as áreas de toque têm tamanho suficiente', async ({ page }) => {
  // 40px é o mínimo prático para o polegar; abaixo disso falha-se o alvo.
  await abrirClientes(page);
  const pequenos = await page.evaluate(() => {
    const maus: string[] = [];
    // Os itens de navegacao sao <a> desde que passaram a rotas reais: sem
    // os incluir aqui, os alvos de toque do menu deixavam de ser medidos.
    document
      .querySelectorAll('.crm-sidebar button, .crm-sidebar a, .crm-header button')
      .forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.height < 30 || r.width < 30) {
          maus.push(
            `${el.getAttribute('aria-label') || el.className}: ${Math.round(r.width)}×${Math.round(r.height)}`,
          );
        }
      });
    return [...new Set(maus)];
  });
  expect(pequenos).toEqual([]);
});
