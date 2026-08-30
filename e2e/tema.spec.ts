import { test, expect } from '@playwright/test';

/**
 * O modo escuro tem de ser escuro em toda a superfície.
 *
 * A versão anterior tinha o painel de atividade a branco puro dentro de uma
 * aplicação escura, porque 384 cores estavam escritas à força no CSS e
 * ignoravam o tema. Um teste que mede a luminância apanha isso; olhar para o
 * ecrã e achar que está bem, não.
 */
test('nenhuma superfície clara em modo escuro', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.crm-side-mark')).toBeVisible({ timeout: 20000 });

  await page.selectOption('select[aria-label="Estilo visual"]', 'escuro');
  const clientes = page.getByRole('link', { name: /^clientes$/i }).first();
  await expect(clientes).toBeVisible({ timeout: 20000 });
  await clientes.click();
  await page.waitForURL('**/clientes');
  await expect(page.locator('.crm-client-list')).toBeVisible({ timeout: 15000 });

  const claras = await page.evaluate(() => {
    /* Um véu translúcido (alpha baixo) sobre fundo escuro continua escuro — é
       a técnica normal de elevação em dark mode. O que não pode existir é uma
       superfície OPACA e clara. */
    const luz = (c: string) => {
      const m = c.match(/[\d.]+/g);
      if (!m || m.length < 3) return 0;
      const [r, g, b] = m.map(Number);
      const alpha = m.length > 3 ? Number(m[3]) : 1;
      if (alpha < 0.5) return 0;
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    const maus: string[] = [];
    document.querySelectorAll('*').forEach((el) => {
      const e = el as HTMLElement;
      const r = e.getBoundingClientRect();
      if (r.width * r.height < 5000) return;
      const bg = getComputedStyle(e).backgroundColor;
      if (bg.includes('rgba(0, 0, 0, 0)')) return;
      if (luz(bg) > 0.7) maus.push(`${String(e.className).slice(0, 40)} → ${bg}`);
    });
    return [...new Set(maus)].slice(0, 10);
  });

  await page.screenshot({ path: 'test-results/tema-escuro.png' });
  console.log('\n>>> superfícies claras:', claras.length, JSON.stringify(claras, null, 1));
  expect(claras).toEqual([]);
});

test('os temas não têm nomes de concorrentes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.crm-side-mark')).toBeVisible({ timeout: 20000 });

  const opcoes = await page.locator('select[aria-label="Estilo visual"] option').allTextContents();
  expect(opcoes).toEqual(['Claro 1', 'Claro 2', 'Escuro']);
});

test('o texto tem contraste suficiente em todos os temas', async ({ page }) => {
  /**
   * A migração de `color: #fff` para um token de superfície fez a marca da
   * barra lateral ficar escura sobre escuro. Um teste de contraste apanha
   * isso; olhar de relance não apanha.
   */
  await page.goto('/');
  await expect(page.locator('.crm-side-mark')).toBeVisible({ timeout: 20000 });

  for (const tema of ['claro-1', 'claro-2', 'escuro']) {
    await page.selectOption('select[aria-label="Estilo visual"]', tema);
    await page.waitForTimeout(300);

    const ilegiveis = await page.evaluate(() => {
      const rgb = (c: string) => (c.match(/[\d.]+/g) || ['0', '0', '0']).map(Number);
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => {
          const x = v / 255;
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const fundoDe = (el: HTMLElement): number[] => {
        let n: HTMLElement | null = el;
        while (n) {
          const c = getComputedStyle(n).backgroundColor;
          const p = rgb(c);
          if (!c.includes('rgba(0, 0, 0, 0)') && (p[3] ?? 1) > 0.5) return p;
          n = n.parentElement;
        }
        return [255, 255, 255];
      };
      const maus: string[] = [];
      document.querySelectorAll('*').forEach((el) => {
        const e = el as HTMLElement;
        const txt = e.textContent?.trim();
        if (!txt || e.children.length > 0 || txt.length < 2) return;
        const r = e.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return;
        const l1 = lum(rgb(getComputedStyle(e).color));
        const l2 = lum(fundoDe(e));
        const razao = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        if (razao < 2.5) maus.push(`"${txt.slice(0, 24)}" ${razao.toFixed(1)}:1`);
      });
      return [...new Set(maus)].slice(0, 6);
    });

    expect(ilegiveis, `tema ${tema}`).toEqual([]);
  }
});
