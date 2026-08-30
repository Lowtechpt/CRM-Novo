import { test, expect } from '@playwright/test';

/**
 * Instalabilidade do PWA.
 *
 * Foi requisito desde o primeiro dia — "instalável em telemóveis e PCs" — e
 * nunca tinha sido verificado. Estava configurado e **não funcionava**: o
 * manifest apontava para cinco ícones que não existiam no repositório.
 *
 * Corre contra o build de produção servido pelo Express (porta 3002), porque é
 * aí que o service worker existe; em `vite dev` não é gerado.
 */
const BASE = 'http://localhost:3002';

test('o manifest cumpre os critérios de instalação', async ({ page }) => {
  await page.goto(BASE);

  const m = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    if (!link) return null;
    const r = await fetch(link.href);
    return r.json();
  });

  expect(m, 'não há <link rel="manifest">').not.toBeNull();
  expect(m.name).toBeTruthy();
  expect(m.short_name).toBeTruthy();
  expect(m.start_url).toBeTruthy();
  // `standalone` é o que faz a app abrir sem barra de endereço.
  expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(m.display);

  // Android exige um ícone de 192 e outro de 512; sem `maskable`, desenha o
  // ícone dentro de um quadrado branco.
  const tamanhos = m.icons.map((i: { sizes: string }) => i.sizes);
  expect(tamanhos).toContain('192x192');
  expect(tamanhos).toContain('512x512');
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
});

test('todos os ícones do manifest existem mesmo', async ({ page }) => {
  // O manifest anterior listava cinco ficheiros e nenhum estava no repositório.
  await page.goto(BASE);
  const codigos = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    const m = await (await fetch(link.href)).json();
    return Promise.all(
      m.icons.map(async (i: { src: string }) => {
        const r = await fetch(new URL(i.src, location.origin).href);
        return `${i.src}: ${r.status}`;
      }),
    );
  });
  expect(
    codigos.every((c) => c.endsWith(': 200')),
    codigos.join(' · '),
  ).toBe(true);
});

test('o service worker regista e assume o controlo', async ({ page }) => {
  await page.goto(BASE);
  const estado = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'sem suporte';
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return 'não registado';
    await navigator.serviceWorker.ready;
    return 'ativo';
  });
  expect(estado).toBe('ativo');
});
