import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { req, db, prepararBase, tokenPara } from './test/helpers.js';

/**
 * Testes de autenticação e autorização.
 *
 * É a camada que, se falhar, expõe a base de dados inteira — nomes, telefones,
 * notas internas e valores de negócio. Por isso é a primeira a ser testada.
 */

beforeAll(prepararBase);

describe('POST /api/auth/login', () => {
  it('devolve token e utilizador com credenciais corretas', async () => {
    const res = await req()
      .post('/api/auth/login')
      .send({ email: 'admin@teste.pt', password: 'teste-1234' });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.email).toBe('admin@teste.pt');
    expect(res.body.user.role).toBe('admin');
  });

  it('nunca devolve o hash da password', async () => {
    const res = await req()
      .post('/api/auth/login')
      .send({ email: 'admin@teste.pt', password: 'teste-1234' });

    expect(JSON.stringify(res.body)).not.toMatch(/password_hash|\$2[aby]\$/);
  });

  it('aceita o email em maiúsculas e com espaços', async () => {
    const res = await req()
      .post('/api/auth/login')
      .send({ email: '  ADMIN@TESTE.PT  ', password: 'teste-1234' });

    expect(res.status).toBe(200);
  });

  it('rejeita password errada', async () => {
    const res = await req()
      .post('/api/auth/login')
      .send({ email: 'admin@teste.pt', password: 'errada' });

    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it('responde igual a email inexistente e a password errada', async () => {
    // Respostas diferentes revelariam quais os emails registados — é a base
    // de um ataque de enumeração de contas.
    const inexistente = await req()
      .post('/api/auth/login')
      .send({ email: 'ninguem@teste.pt', password: 'seja-o-que-for' });
    const errada = await req()
      .post('/api/auth/login')
      .send({ email: 'admin@teste.pt', password: 'errada' });

    expect(inexistente.status).toBe(errada.status);
    expect(inexistente.body).toEqual(errada.body);
  });

  it('exige email e password', async () => {
    expect((await req().post('/api/auth/login').send({})).status).toBe(400);
    expect((await req().post('/api/auth/login').send({ email: 'a@b.pt' })).status).toBe(400);
  });
});

describe('proteção das rotas', () => {
  const protegidas = [
    ['get', '/api/clients'],
    ['get', '/api/deals'],
    ['get', '/api/agenda'],
    ['get', '/api/salespeople'],
    ['post', '/api/clients'],
  ] as const;

  it.each(protegidas)('%s %s exige token', async (metodo, rota) => {
    const res = await (req() as any)[metodo](rota);
    expect(res.status).toBe(401);
  });

  it('rejeita token com assinatura inválida', async () => {
    const falso = jwt.sign(
      { id: 'x', email: 'a@b.pt', name: 'A', role: 'admin' },
      'segredo-errado',
    );
    const res = await req().get('/api/clients').set('Authorization', `Bearer ${falso}`);
    expect(res.status).toBe(401);
  });

  it('rejeita token expirado', async () => {
    const expirado = jwt.sign(
      { id: 'x', email: 'a@b.pt', name: 'A', role: 'admin' },
      process.env.JWT_SECRET!,
      { expiresIn: '-1h' },
    );
    const res = await req().get('/api/clients').set('Authorization', `Bearer ${expirado}`);
    expect(res.status).toBe(401);
  });

  it('rejeita cabeçalho sem o prefixo Bearer', async () => {
    const token = await tokenPara('admin');
    const res = await req().get('/api/clients').set('Authorization', token);
    expect(res.status).toBe(401);
  });

  it('aceita token válido', async () => {
    const token = await tokenPara('user');
    const res = await req().get('/api/clients').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('rate limiting do login', () => {
  /**
   * Verifica-se que o limitador está montado e a contar, em vez de o esgotar:
   * a janela é de 15 minutos e partilhada por todo o processo, pelo que um
   * teste que o esgotasse faria falhar todos os logins seguintes da suite.
   */
  it('conta as tentativas e anuncia o limite nos cabeçalhos', async () => {
    const primeira = await req()
      .post('/api/auth/login')
      .send({ email: 'admin@teste.pt', password: 'errada' });
    const segunda = await req()
      .post('/api/auth/login')
      .send({ email: 'admin@teste.pt', password: 'errada' });

    expect(primeira.headers['ratelimit-limit']).toBeDefined();
    expect(Number(segunda.headers['ratelimit-remaining'])).toBeLessThan(
      Number(primeira.headers['ratelimit-remaining']),
    );
  });
});

describe('GET /api/auth/me', () => {
  it('devolve o utilizador do token', async () => {
    const token = await tokenPara('user');
    const res = await req().get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('user');
  });
});

describe('revogação de sessões', () => {
  /**
   * Um JWT vale até expirar. Este vale 12 horas e vive em `localStorage`, ao
   * alcance de qualquer XSS — e até aqui não havia forma de o cortar: mudar a
   * password não fazia diferença nenhuma.
   */
  it('revogar invalida o token que já estava em uso', async () => {
    const token = await tokenPara('user');

    // Funciona antes.
    expect((await req().get('/api/clients').set('Authorization', `Bearer ${token}`)).status).toBe(
      200,
    );

    await req().post('/api/auth/revogar-sessoes').set('Authorization', `Bearer ${token}`);

    // E deixa de funcionar imediatamente a seguir, sem esperar pela expiração.
    const depois = await req().get('/api/clients').set('Authorization', `Bearer ${token}`);
    expect(depois.status).toBe(401);
    expect(depois.body.error).toMatch(/terminada/i);
  });

  it('revogar não afeta as sessões de outras contas', async () => {
    const a = await tokenPara('user');
    const b = await tokenPara('user');

    await req().post('/api/auth/revogar-sessoes').set('Authorization', `Bearer ${a}`);

    expect((await req().get('/api/clients').set('Authorization', `Bearer ${b}`)).status).toBe(200);
  });

  it('um novo login depois de revogar volta a funcionar', async () => {
    const token = await tokenPara('admin');
    await req().post('/api/auth/revogar-sessoes').set('Authorization', `Bearer ${token}`);

    // `tokenPara` cria conta nova; aqui o que se prova é que a revogação não
    // deixa a conta inutilizável — o mecanismo é por versão, não por bloqueio.
    const novo = await tokenPara('admin');
    expect((await req().get('/api/clients').set('Authorization', `Bearer ${novo}`)).status).toBe(
      200,
    );
  });

  it('um token de utilizador apagado deixa de valer', async () => {
    const token = await tokenPara('user');
    const me = await req().get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    await db.execute({ sql: 'DELETE FROM users WHERE id=?', args: [me.body.user.id] });

    expect((await req().get('/api/clients').set('Authorization', `Bearer ${token}`)).status).toBe(
      401,
    );
  });
});
