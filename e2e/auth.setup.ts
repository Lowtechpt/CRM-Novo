import { test as setup, expect } from '@playwright/test';
import { join } from 'path';

/**
 * Autentica uma vez e guarda a sessão para os restantes testes.
 *
 * Sem isto, cada teste fazia o seu próprio login e a suite esgotava o
 * limitador de tentativas do servidor (10 por 15 minutos) — os testes
 * começavam a falhar por 429, não por defeito da aplicação. O limitador está
 * correto; era a suite que o usava mal.
 */

export const ESTADO = join(process.cwd(), 'e2e', '.auth', 'sessao.json');

import { EMAIL, PASSWORD } from './credenciais';

setup('autenticar uma vez', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('button', { name: 'Entrar' })).toBeHidden({ timeout: 20_000 });
  await page.context().storageState({ path: ESTADO });

  /* ── Garantir que há dados ──
     Vários testes escolhem "o primeiro cliente da lista". Numa base acabada de
     criar — que é o caso do CI, sempre — não há lista nenhuma, e o clique
     expira ao fim de 30 segundos sem dizer porquê.

     Na máquina de quem programa isto nunca aparece: a base local já tem os
     dados de demonstração de outra altura. Foi assim que cinco testes de
     telemóvel passaram aqui e falharam no CI.

     Só semeia se estiver vazia: repetir o seed apagaria o que os testes de
     fluxo criam. */
  const token = await page.evaluate(() => localStorage.getItem('crm_token'));
  const auth = { Authorization: `Bearer ${token}` };

  const clientes = await page.request.get('/api/clients', { headers: auth });
  const corpo = await clientes.json();
  const quantos = Array.isArray(corpo) ? corpo.length : (corpo?.data?.length ?? 0);

  if (quantos === 0) {
    const r = await page.request.post('/api/seed', { headers: auth });
    expect(r.ok(), 'não foi possível semear a base para os testes').toBeTruthy();
  }
});
