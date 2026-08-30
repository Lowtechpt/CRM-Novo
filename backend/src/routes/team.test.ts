import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { req, db, prepararBase, limparDados, tokenPara, criarCliente } from '../test/helpers.js';

/** Equipa comercial, concorrência e os insights derivados. */

let token: string;
const auth = () => `Bearer ${token}`;

beforeAll(async () => {
  await prepararBase();
  token = await tokenPara('admin');
});

beforeEach(limparDados);

const hoje = () => new Date().toISOString().slice(0, 10);
const haDias = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

async function criarComercial(nome = 'Rui Costa') {
  const res = await req()
    .post('/api/salespeople')
    .set('Authorization', auth())
    .send({
      name: nome,
      email: `${nome.split(' ')[0].toLowerCase()}@empresa.pt`,
      role: 'Comercial',
    });
  expect(res.status).toBe(201);
  return res.body;
}

describe('comerciais', () => {
  it('cria e lista', async () => {
    await criarComercial();
    const res = await req().get('/api/salespeople').set('Authorization', auth());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Rui Costa');
  });

  it('exige nome', async () => {
    const res = await req()
      .post('/api/salespeople')
      .set('Authorization', auth())
      .send({ email: 'sem.nome@empresa.pt' });

    expect(res.status).toBe(400);
  });

  it('remove', async () => {
    const p = await criarComercial();
    await req().delete(`/api/salespeople/${p.id}`).set('Authorization', auth());

    const res = await req().get('/api/salespeople').set('Authorization', auth());
    expect(res.body).toHaveLength(0);
  });

  it('atribui um cliente a um comercial', async () => {
    const p = await criarComercial();
    const c = await criarCliente(token);

    const res = await req()
      .put(`/api/clients/${c.id}`)
      .set('Authorization', auth())
      .send({ ...c, salespersonId: p.id });

    expect(res.status).toBe(200);
    expect(res.body.salespersonId).toBe(p.id);
  });
});

describe('concorrência', () => {
  it('regista um concorrente num cliente', async () => {
    const c = await criarCliente(token);
    const res = await req().post('/api/competition').set('Authorization', auth()).send({
      clientId: c.id,
      competitor: 'Rival SA',
      competitorProduct: 'Linha X',
      ourProduct: 'Linha Y',
      competitorValue: 12000,
      ourValue: 11000,
      status: 'Em disputa',
      date: hoje(),
    });

    expect(res.status).toBe(201);
    expect(res.body.competitor).toBe('Rival SA');
  });

  it('rejeita estado desconhecido', async () => {
    const c = await criarCliente(token);
    const res = await req()
      .post('/api/competition')
      .set('Authorization', auth())
      .send({ clientId: c.id, competitor: 'X', status: 'Inventado', date: hoje() });

    expect(res.status).toBe(400);
  });

  it('lista por cliente', async () => {
    const c = await criarCliente(token);
    await req()
      .post('/api/competition')
      .set('Authorization', auth())
      .send({ clientId: c.id, competitor: 'Rival SA', status: 'Instalado', date: hoje() });

    const res = await req().get(`/api/clients/${c.id}/competition`).set('Authorization', auth());

    expect(res.body).toHaveLength(1);
  });

  it('atualiza o desfecho', async () => {
    const c = await criarCliente(token);
    const criado = (
      await req()
        .post('/api/competition')
        .set('Authorization', auth())
        .send({ clientId: c.id, competitor: 'Rival SA', status: 'Em disputa', date: hoje() })
    ).body;

    const res = await req()
      .put(`/api/competition/${criado.id}`)
      .set('Authorization', auth())
      .send({ ...criado, status: 'Ganho' });

    expect(res.body.status).toBe('Ganho');
  });
});

describe('scoring', () => {
  it('calcula o score de um cliente a partir do histórico', async () => {
    const c = await criarCliente(token);
    await req()
      .post(`/api/clients/${c.id}/activities`)
      .set('Authorization', auth())
      .send({ type: 'Reunião', date: hoje(), time: '10:00', notes: 'Visita' });
    await req()
      .post('/api/deals')
      .set('Authorization', auth())
      .send({ clientId: c.id, title: 'X', value: 40000, stage: 'Negociação' });

    const res = await req().get(`/api/clients/${c.id}/score`).set('Authorization', auth());

    expect(res.status).toBe(200);
    expect(typeof res.body.score).toBe('number');
    expect(res.body.score).toBeGreaterThanOrEqual(0);
    expect(res.body.score).toBeLessThanOrEqual(100);
  });

  it('um cliente com atividade recente pontua acima de um esquecido', async () => {
    const ativo = await criarCliente(token, { name: 'Ativo' });
    const frio = await criarCliente(token, { name: 'Frio' });

    await req()
      .post(`/api/clients/${ativo.id}/activities`)
      .set('Authorization', auth())
      .send({ type: 'Reunião', date: hoje(), time: '10:00', notes: 'Visita' });
    await req()
      .post('/api/deals')
      .set('Authorization', auth())
      .send({ clientId: ativo.id, title: 'X', value: 50000, stage: 'Negociação' });

    await req()
      .post(`/api/clients/${frio.id}/activities`)
      .set('Authorization', auth())
      .send({ type: 'Nota', date: haDias(200), time: '10:00', notes: 'Antigo' });

    const [a, f] = await Promise.all([
      req().get(`/api/clients/${ativo.id}/score`).set('Authorization', auth()),
      req().get(`/api/clients/${frio.id}/score`).set('Authorization', auth()),
    ]);

    expect(a.body.score).toBeGreaterThan(f.body.score);
  });

  it('recalcula os scores de toda a carteira', async () => {
    await criarCliente(token, { name: 'A' });
    await criarCliente(token, { name: 'B' });

    const res = await req().post('/api/scoring/recalculate').set('Authorization', auth());
    expect(res.status).toBe(200);
  });
});

describe('insights de gestão', () => {
  it('o briefing responde com a estrutura esperada', async () => {
    await criarCliente(token);
    const res = await req().get('/api/insights/briefing').set('Authorization', auth());

    expect(res.status).toBe(200);
    expect(res.body).toBeTypeOf('object');
  });

  it('a previsão pondera os negócios em aberto', async () => {
    const c = await criarCliente(token);
    await req()
      .post('/api/deals')
      .set('Authorization', auth())
      .send({ clientId: c.id, title: 'X', value: 10000, stage: 'Negociação', probability: 50 });

    const res = await req().get('/api/insights/forecast').set('Authorization', auth());

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toMatch(/\d/);
  });

  it('o custo do silêncio soma o valor em risco dos clientes esquecidos', async () => {
    const frio = await criarCliente(token, { name: 'Esquecido' });
    await req()
      .post(`/api/clients/${frio.id}/activities`)
      .set('Authorization', auth())
      .send({ type: 'Nota', date: haDias(120), time: '10:00', notes: 'Último contacto' });
    await req()
      .post('/api/deals')
      .set('Authorization', auth())
      .send({ clientId: frio.id, title: 'Em risco', value: 30000, stage: 'Proposta' });

    const res = await req().get('/api/insights/silence').set('Authorization', auth());

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain('Esquecido');
  });
});

describe('operações em massa', () => {
  it('altera o estado de vários clientes de uma vez', async () => {
    const a = await criarCliente(token, { name: 'A' });
    const b = await criarCliente(token, { name: 'B' });

    const res = await req()
      .post('/api/clients/bulk')
      .set('Authorization', auth())
      .send({ ids: [a.id, b.id], patch: { status: 'Ativo' } });

    expect(res.status).toBe(200);

    const lista = await req().get('/api/clients').set('Authorization', auth());
    expect(lista.body.every((c: any) => c.status === 'Ativo')).toBe(true);
  });

  it('rejeita alteração em massa com dados inválidos', async () => {
    const a = await criarCliente(token);
    const res = await req()
      .post('/api/clients/bulk')
      .set('Authorization', auth())
      .send({ ids: [a.id], patch: { status: 'Inventado' } });

    expect(res.status).toBe(400);
  });

  it('rejeita lista de ids vazia', async () => {
    const res = await req()
      .post('/api/clients/bulk')
      .set('Authorization', auth())
      .send({ ids: [], patch: { status: 'Ativo' } });

    expect(res.status).toBe(400);
  });
});

describe('editar um comercial', () => {
  /**
   * Faltava o PUT. A única forma de corrigir um nome mal escrito era apagar e
   * recriar — o que quebrava a ligação histórica aos clientes, às atividades e
   * aos registos de concorrência, que guardam o id antigo.
   */
  it('atualiza os dados sem trocar o id', async () => {
    const p = await criarComercial('Rui Costa');
    const res = await req()
      .put(`/api/salespeople/${p.id}`)
      .set('Authorization', auth())
      .send({ ...p, name: 'Rui Costa Silva', role: 'Diretor Comercial' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(p.id);
    expect(res.body.name).toBe('Rui Costa Silva');
    expect(res.body.role).toBe('Diretor Comercial');
  });

  it('a associação aos clientes sobrevive à edição', async () => {
    const p = await criarComercial();
    const c = await criarCliente(token);
    await req()
      .put(`/api/clients/${c.id}`)
      .set('Authorization', auth())
      .send({ ...c, salespersonId: p.id });

    await req()
      .put(`/api/salespeople/${p.id}`)
      .set('Authorization', auth())
      .send({ ...p, name: 'Nome Corrigido' });

    const lista = await req().get('/api/clients').set('Authorization', auth());
    expect(lista.body[0].salespersonId).toBe(p.id);
  });

  it('devolve 404 para id inexistente', async () => {
    const res = await req()
      .put('/api/salespeople/nao-existe')
      .set('Authorization', auth())
      .send({ name: 'X' });

    expect(res.status).toBe(404);
  });

  it('valida os dados', async () => {
    const p = await criarComercial();
    const res = await req()
      .put(`/api/salespeople/${p.id}`)
      .set('Authorization', auth())
      .send({ name: '' });

    expect(res.status).toBe(400);
  });
});

describe('atomicidade das escritas com histórico', () => {
  /**
   * A atualização e as linhas de auditoria são uma coisa só. Em sequência, uma
   * falha entre as duas deixava o histórico a afirmar uma alteração que nunca
   * foi gravada — uma auditoria que mente é pior do que auditoria nenhuma.
   */
  it('nenhuma linha de histórico fica órfã de uma alteração', async () => {
    const c = await criarCliente(token, { status: 'Prospeto', score: 40 });

    await req()
      .put(`/api/clients/${c.id}`)
      .set('Authorization', auth())
      .send({ ...c, status: 'Ativo', score: 90 });

    const [cliente, log] = await Promise.all([
      db.execute({ sql: 'SELECT status, score FROM clients WHERE id=?', args: [c.id] }),
      db.execute({ sql: 'SELECT field, new_value FROM audit_log WHERE entity_id=?', args: [c.id] }),
    ]);

    const linha = cliente.rows[0] as any;
    const registado = new Map((log.rows as any[]).map((r) => [r.field, r.new_value]));

    // O que o histórico afirma tem de bater certo com o que está gravado.
    expect(registado.get('Estado')).toBe(linha.status);
    expect(registado.get('Score')).toBe(String(linha.score));
  });

  it('eliminar deixa o registo e o rasto coerentes', async () => {
    const c = await criarCliente(token, { name: 'Coerente' });
    await req().delete(`/api/clients/${c.id}`).set('Authorization', auth());

    const [existe, log] = await Promise.all([
      db.execute({ sql: 'SELECT COUNT(*) AS n FROM clients WHERE id=?', args: [c.id] }),
      db.execute({
        sql: "SELECT COUNT(*) AS n FROM audit_log WHERE entity_id=? AND field='Eliminado'",
        args: [c.id],
      }),
    ]);

    // Apagado E registado — nunca um sem o outro.
    expect(Number((existe.rows[0] as any).n)).toBe(0);
    expect(Number((log.rows[0] as any).n)).toBe(1);
  });
});
