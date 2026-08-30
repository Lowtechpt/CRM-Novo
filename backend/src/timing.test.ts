import { describe, it, expect, beforeAll } from 'vitest';
import { req, prepararBase } from './test/helpers.js';

/**
 * Canal lateral de tempo no login.
 *
 * A mensagem de erro já era igual para "email não existe" e "password errada".
 * Não chegava: sem conta, o `bcrypt.compare` nunca corria e a resposta saía em
 * ~4 ms, contra ~99 ms com conta existente — 22× de diferença, medido. Bastava
 * um script a cronometrar para saber que emails têm conta, sem nunca acertar
 * numa password.
 */

beforeAll(prepararBase);

/** Mediana, para uma medição estável em CI partilhado. */
function mediana(xs: number[]): number {
  const ordenados = [...xs].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

async function tempoDeLogin(email: string, repeticoes = 7): Promise<number> {
  const tempos: number[] = [];
  for (let i = 0; i < repeticoes; i++) {
    const inicio = performance.now();
    await req().post('/api/auth/login').send({ email, password: 'password-errada-de-certeza' });
    tempos.push(performance.now() - inicio);
  }
  return mediana(tempos);
}

describe('login: mesma resposta e mesmo tempo', () => {
  it('não distingue conta existente de inexistente pelo tempo', async () => {
    // Aquecimento: a primeira chamada carrega módulos e distorce a medição.
    await tempoDeLogin('admin@teste.pt', 2);

    const existe = await tempoDeLogin('admin@teste.pt');
    const naoExiste = await tempoDeLogin('fantasma@teste.pt');

    const razao = Math.max(existe, naoExiste) / Math.min(existe, naoExiste);

    // Antes da correção esta razão era ~22. O limite é folgado de propósito:
    // em CI partilhado o ruído é grande, e o que se quer apanhar é a ordem de
    // grandeza que torna a enumeração prática, não variação de milissegundos.
    expect(
      razao,
      `existe=${existe.toFixed(1)}ms nao_existe=${naoExiste.toFixed(1)}ms razao=${razao.toFixed(1)}`,
    ).toBeLessThan(3);
  });

  it('a resposta continua a ser indistinguível', async () => {
    const existe = await req()
      .post('/api/auth/login')
      .send({ email: 'admin@teste.pt', password: 'errada' });
    const naoExiste = await req()
      .post('/api/auth/login')
      .send({ email: 'fantasma@teste.pt', password: 'errada' });

    expect(existe.status).toBe(naoExiste.status);
    expect(existe.body).toEqual(naoExiste.body);
  });
});
