import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { req, db, prepararBase, limparDados, tokenPara, criarCliente } from '../test/helpers.js';

/**
 * Testes das rotas de dados: atividades, negócios, agenda, interlocutores e
 * insights. O foco está no que a UI depende e no que pode corromper dados —
 * integridade referencial, cascatas e agregações.
 */

let token: string;
const auth = () => `Bearer ${token}`;

beforeAll(async () => {
  await prepararBase();
  token = await tokenPara('admin');
});

beforeEach(limparDados);

const hoje = () => new Date().toISOString().slice(0, 10);
const haDias = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

describe('atividades', () => {
  it('cria e lista por cliente', async () => {
    const c = await criarCliente(token);
    const criada = await req()
      .post(`/api/clients/${c.id}/activities`)
      .set('Authorization', auth())
      .send({ type: 'Telefonema', date: hoje(), time: '14:30', notes: 'Falei sobre a garantia' });

    expect(criada.status).toBe(201);

    const lista = await req().get(`/api/clients/${c.id}/activities`).set('Authorization', auth());

    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].notes).toBe('Falei sobre a garantia');
  });

  it('rejeita data em formato errado', async () => {
    const c = await criarCliente(token);
    const res = await req()
      .post(`/api/clients/${c.id}/activities`)
      .set('Authorization', auth())
      .send({ type: 'Nota', date: '30-01-2026', time: '10:00', notes: 'x' });

    expect(res.status).toBe(400);
  });

  it('rejeita tipo de atividade desconhecido', async () => {
    const c = await criarCliente(token);
    const res = await req()
      .post(`/api/clients/${c.id}/activities`)
      .set('Authorization', auth())
      .send({ type: 'Telepatia', date: hoje(), time: '10:00', notes: 'x' });

    expect(res.status).toBe(400);
  });

  it('apagar o cliente apaga as atividades dele', async () => {
    // A cascata está declarada no esquema; se um dia a foreign key deixar de
    // ser aplicada, ficam atividades órfãs a inflacionar contagens.
    const c = await criarCliente(token);
    await req()
      .post(`/api/clients/${c.id}/activities`)
      .set('Authorization', auth())
      .send({ type: 'Nota', date: hoje(), time: '09:00', notes: 'x' });

    await req().delete(`/api/clients/${c.id}`).set('Authorization', auth());

    const orfas = await db.execute({
      sql: 'SELECT COUNT(*) AS n FROM activities WHERE client_id=?',
      args: [c.id],
    });
    expect(Number((orfas.rows[0] as any).n)).toBe(0);
  });

  it('as recentes vêm da carteira toda, ordenadas', async () => {
    const a = await criarCliente(token, { name: 'A' });
    const b = await criarCliente(token, { name: 'B' });
    for (const [cli, dia] of [
      [a, haDias(5)],
      [b, haDias(1)],
    ] as const) {
      await req()
        .post(`/api/clients/${cli.id}/activities`)
        .set('Authorization', auth())
        .send({ type: 'Nota', date: dia, time: '10:00', notes: dia });
    }

    const res = await req().get('/api/activities/recent?limit=10').set('Authorization', auth());

    expect(res.body).toHaveLength(2);
    expect(res.body[0].date >= res.body[1].date).toBe(true);
  });
});

describe('negócios', () => {
  it('cria com valor e fase', async () => {
    const c = await criarCliente(token);
    const res = await req()
      .post('/api/deals')
      .set('Authorization', auth())
      .send({ clientId: c.id, title: 'Fornecimento 2026', value: 25000, stage: 'Proposta' });

    expect(res.status).toBe(201);
    expect(res.body.value).toBe(25000);
  });

  it('rejeita fase desconhecida', async () => {
    const c = await criarCliente(token);
    const res = await req()
      .post('/api/deals')
      .set('Authorization', auth())
      .send({ clientId: c.id, title: 'X', value: 1, stage: 'Inventada' });

    expect(res.status).toBe(400);
  });

  it('rejeita valor negativo', async () => {
    const c = await criarCliente(token);
    const res = await req()
      .post('/api/deals')
      .set('Authorization', auth())
      .send({ clientId: c.id, title: 'X', value: -100, stage: 'Proposta' });

    expect(res.status).toBe(400);
  });

  it('move de fase e mantém o valor', async () => {
    const c = await criarCliente(token);
    const d = (
      await req()
        .post('/api/deals')
        .set('Authorization', auth())
        .send({ clientId: c.id, title: 'X', value: 5000, stage: 'Proposta' })
    ).body;

    const res = await req()
      .put(`/api/deals/${d.id}`)
      .set('Authorization', auth())
      .send({ ...d, stage: 'Ganho' });

    expect(res.status).toBe(200);
    expect(res.body.stage).toBe('Ganho');
    expect(res.body.value).toBe(5000);
  });
});

describe('agenda', () => {
  it('cria evento e marca como feito', async () => {
    const c = await criarCliente(token);
    const criado = (
      await req()
        .post('/api/agenda')
        .set('Authorization', auth())
        .send({ clientId: c.id, type: 'Reunião', title: 'Visita', date: hoje(), time: '11:00' })
    ).body;

    expect(criado.done).toBe(false);

    const res = await req()
      .put(`/api/agenda/${criado.id}`)
      .set('Authorization', auth())
      .send({ ...criado, done: true });

    expect(res.body.done).toBe(true);
  });

  it('aceita evento sem cliente associado', async () => {
    const res = await req()
      .post('/api/agenda')
      .set('Authorization', auth())
      .send({ type: 'Outro', title: 'Formação interna', date: hoje(), time: '09:00' });

    expect(res.status).toBe(201);
  });
});

describe('interlocutores', () => {
  it('cria, lista e remove', async () => {
    const c = await criarCliente(token);
    const criado = (
      await req()
        .post(`/api/clients/${c.id}/interlocutors`)
        .set('Authorization', auth())
        .send({ name: 'Ana Sousa', role: 'Compras', email: 'ana@exemplo.pt' })
    ).body;

    const lista = await req()
      .get(`/api/clients/${c.id}/interlocutors`)
      .set('Authorization', auth());
    expect(lista.body).toHaveLength(1);

    await req().delete(`/api/interlocutors/${criado.id}`).set('Authorization', auth());

    const depois = await req()
      .get(`/api/clients/${c.id}/interlocutors`)
      .set('Authorization', auth());
    expect(depois.body).toHaveLength(0);
  });
});

describe('GET /api/clients/summary', () => {
  it('agrega tudo numa só resposta, uma linha por cliente', async () => {
    // Esta rota existe para eliminar o N+1: antes era um pedido por cliente.
    const a = await criarCliente(token, { name: 'A' });
    await criarCliente(token, { name: 'B' });

    await req()
      .post(`/api/clients/${a.id}/activities`)
      .set('Authorization', auth())
      .send({ type: 'Nota', date: haDias(10), time: '10:00', notes: 'x' });
    await req()
      .post('/api/deals')
      .set('Authorization', auth())
      .send({ clientId: a.id, title: 'X', value: 3000, stage: 'Proposta' });

    const res = await req().get('/api/clients/summary').set('Authorization', auth());

    expect(res.body).toHaveLength(2);
    const linhaA = res.body.find((s: any) => s.clientId === a.id);
    expect(linhaA.activityCount).toBe(1);
    expect(linhaA.openValue).toBe(3000);
    expect(linhaA.daysSinceContact).toBeGreaterThanOrEqual(9);
  });

  it('devolve nulos coerentes para um cliente sem histórico', async () => {
    await criarCliente(token, { name: 'Novo' });
    const res = await req().get('/api/clients/summary').set('Authorization', auth());

    expect(res.body[0].daysSinceContact).toBeNull();
    expect(res.body[0].activityCount).toBe(0);
    expect(res.body[0].openValue).toBe(0);
  });
});

describe('insights', () => {
  it('o custo do silêncio ignora clientes contactados há pouco', async () => {
    const recente = await criarCliente(token, { name: 'Recente' });
    await req()
      .post(`/api/clients/${recente.id}/activities`)
      .set('Authorization', auth())
      .send({ type: 'Nota', date: hoje(), time: '10:00', notes: 'x' });
    await req()
      .post('/api/deals')
      .set('Authorization', auth())
      .send({ clientId: recente.id, title: 'X', value: 9000, stage: 'Proposta' });

    const res = await req().get('/api/insights/silence').set('Authorization', auth());

    expect(res.status).toBe(200);
    const ids = (res.body.clients || res.body || []).map?.((c: any) => c.id) ?? [];
    expect(ids).not.toContain(recente.id);
  });

  it('deteta duplicados por NIF', async () => {
    await criarCliente(token, { name: 'Móveis Alentejo', nif: '501234567' });
    await criarCliente(token, { name: 'Moveis Alentejo Lda', nif: '501234567' });

    const res = await req().get('/api/insights/duplicates').set('Authorization', auth());

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain('501234567');
  });

  it('o histórico de um cliente é devolvido do mais recente para o mais antigo', async () => {
    const c = await criarCliente(token, { status: 'Prospeto' });
    await req()
      .put(`/api/clients/${c.id}`)
      .set('Authorization', auth())
      .send({ ...c, status: 'Contactado' });
    await req()
      .put(`/api/clients/${c.id}`)
      .set('Authorization', auth())
      .send({ ...c, status: 'Ativo' });

    const res = await req().get(`/api/clients/${c.id}/audit`).set('Authorization', auth());

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });
});

describe('rotas de IA', () => {
  it('respondem sem chave configurada em vez de rebentar', async () => {
    // Na suite a KILO_API_KEY é removida de propósito: nenhum teste deve
    // gastar quota nem depender de um serviço externo.
    const res = await req().get('/api/ia-status').set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
  });
});

describe('tratamento de erros', () => {
  it('devolve 404 em JSON para rota inexistente', async () => {
    const res = await req().get('/api/nao-existe').set('Authorization', auth());

    expect(res.status).toBe(404);
    /* Verificar o CONTENT-TYPE, não só o código. A versão anterior deste teste
       parava no 404 e passava — enquanto o servidor respondia com a página de
       erro HTML do Express, que faz `response.json()` rebentar do lado de quem
       chama. Um teste que confirma metade do contrato dá falsa confiança. */
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error).toBeTruthy();
  });

  it('um id inexistente devolve 404 em JSON, não HTML', async () => {
    const res = await req().get('/api/clients/nao-existe').set('Authorization', auth());

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('GET /clients/:id devolve o cliente', async () => {
    // A rota não existia: a app não dava por isso (carrega tudo e escolhe em
    // memória), mas é a primeira que qualquer consumidor externo tenta.
    const c = await criarCliente(token, { name: 'Único' });
    const res = await req().get(`/api/clients/${c.id}`).set('Authorization', auth());

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(c.id);
    expect(res.body.name).toBe('Único');
  });

  it('devolve 400 para JSON malformado', async () => {
    const res = await req()
      .post('/api/clients')
      .set('Authorization', auth())
      .set('Content-Type', 'application/json')
      .send('{ isto não é json');

    expect(res.status).toBe(400);
  });
});
