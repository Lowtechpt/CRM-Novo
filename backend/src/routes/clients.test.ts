import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  req,
  db,
  prepararBase,
  limparDados,
  tokenPara,
  clienteExemplo,
  criarCliente,
} from '../test/helpers.js';

let admin: string;
let user: string;

beforeAll(async () => {
  await prepararBase();
  admin = await tokenPara('admin');
  user = await tokenPara('user');
});

beforeEach(limparDados);

describe('GET /api/clients', () => {
  it('devolve um array por omissão', async () => {
    await criarCliente(admin);
    const res = await req().get('/api/clients').set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
  });

  it('ordena os destacados primeiro', async () => {
    await criarCliente(admin, { name: 'Alfa', starred: false, score: 90 });
    await criarCliente(admin, { name: 'Zeta', starred: true, score: 10 });

    const res = await req().get('/api/clients').set('Authorization', `Bearer ${admin}`);
    expect(res.body[0].name).toBe('Zeta');
  });

  it('devolve envelope paginado com page=1', async () => {
    for (let i = 0; i < 5; i++) await criarCliente(admin, { name: `Cliente ${i}` });

    const res = await req()
      .get('/api/clients?page=1&limit=2')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(5);
    expect(res.body.limit).toBe(2);
    expect(res.body.offset).toBe(0);
  });

  it('percorre as páginas sem repetir nem perder registos', async () => {
    for (let i = 0; i < 7; i++) await criarCliente(admin, { name: `Cliente ${i}`, score: 50 - i });

    const vistos: string[] = [];
    for (let offset = 0; offset < 7; offset += 3) {
      const res = await req()
        .get(`/api/clients?page=1&limit=3&offset=${offset}`)
        .set('Authorization', `Bearer ${admin}`);
      vistos.push(...res.body.data.map((c: any) => c.id));
    }

    expect(vistos).toHaveLength(7);
    expect(new Set(vistos).size).toBe(7);
  });

  it('impõe um teto ao limit, para ninguém pedir a tabela inteira', async () => {
    const res = await req()
      .get('/api/clients?page=1&limit=99999')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.body.limit).toBe(1000);
  });

  it('trata limit inválido como o valor por omissão', async () => {
    const res = await req()
      .get('/api/clients?page=1&limit=abc')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.body.limit).toBe(200);
  });

  it('filtra por texto em nome, NIF, email e localidade', async () => {
    await criarCliente(admin, { name: 'Móveis Alentejo', city: 'Évora' });
    await criarCliente(admin, { name: 'Metalúrgica Norte', city: 'Braga' });

    const res = await req()
      .get('/api/clients?page=1&q=Braga')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.body.total).toBe(1);
    expect(res.body.data[0].name).toBe('Metalúrgica Norte');
  });

  it('não é vulnerável a injeção pelo parâmetro de pesquisa', async () => {
    await criarCliente(admin);
    const res = await req()
      .get(`/api/clients?page=1&q=${encodeURIComponent("'; DROP TABLE clients; --")}`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    // A tabela tem de continuar a existir e com o registo lá dentro.
    const ainda = await db.execute('SELECT COUNT(*) AS n FROM clients');
    expect(Number((ainda.rows[0] as any).n)).toBe(1);
  });
});

describe('POST /api/clients', () => {
  it('cria e devolve 201 com o registo', async () => {
    const res = await req()
      .post('/api/clients')
      .set('Authorization', `Bearer ${admin}`)
      .send(clienteExemplo());

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.name).toBe('Móveis Alentejo, Lda');
  });

  it('aplica os valores por omissão', async () => {
    const res = await req()
      .post('/api/clients')
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'Só o nome' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('Prospeto');
    expect(res.body.score).toBe(50);
  });

  it('rejeita sem nome', async () => {
    const res = await req()
      .post('/api/clients')
      .set('Authorization', `Bearer ${admin}`)
      .send({ sector: 'Mobiliário' });

    expect(res.status).toBe(400);
  });

  it('rejeita estado fora dos valores permitidos', async () => {
    const res = await req()
      .post('/api/clients')
      .set('Authorization', `Bearer ${admin}`)
      .send(clienteExemplo({ status: 'Inventado' }));

    expect(res.status).toBe(400);
  });

  it('rejeita email malformado e diz qual o campo', async () => {
    const res = await req()
      .post('/api/clients')
      .set('Authorization', `Bearer ${admin}`)
      .send(clienteExemplo({ email: 'isto-nao-e-email' }));

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/email/i);
  });

  it('um utilizador comum pode criar', async () => {
    const res = await req()
      .post('/api/clients')
      .set('Authorization', `Bearer ${user}`)
      .send(clienteExemplo());

    expect(res.status).toBe(201);
  });
});

describe('PUT /api/clients/:id', () => {
  it('atualiza os campos enviados', async () => {
    const c = await criarCliente(admin);
    const res = await req()
      .put(`/api/clients/${c.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ ...c, status: 'Ativo', score: 85 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Ativo');
    expect(res.body.score).toBe(85);
  });

  it('regista no histórico o que mudou', async () => {
    const c = await criarCliente(admin, { status: 'Prospeto' });
    await req()
      .put(`/api/clients/${c.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ ...c, status: 'Ativo' });

    const log = await db.execute({
      sql: 'SELECT * FROM audit_log WHERE entity_id=?',
      args: [c.id],
    });
    const estado = log.rows.find((r: any) => r.field === 'Estado') as any;

    expect(estado).toBeDefined();
    expect(estado.old_value).toBe('Prospeto');
    expect(estado.new_value).toBe('Ativo');
  });

  it('regista QUEM fez a alteração', async () => {
    // Sem autor, o histórico não serve como auditoria: mostra que algo mudou
    // mas não permite responsabilizar ninguém.
    const c = await criarCliente(admin);
    await req()
      .put(`/api/clients/${c.id}`)
      .set('Authorization', `Bearer ${user}`)
      .send({ ...c, status: 'Ativo' });

    const log = await db.execute({
      sql: 'SELECT * FROM audit_log WHERE entity_id=? AND field=?',
      args: [c.id, 'Estado'],
    });
    const linha = log.rows[0] as any;

    expect(linha.user_id).toBeTruthy();
    expect(linha.user_name).toBe('Utilizador user');
  });

  it('não regista nada quando nada muda', async () => {
    const c = await criarCliente(admin);
    await req().put(`/api/clients/${c.id}`).set('Authorization', `Bearer ${admin}`).send(c);

    const log = await db.execute({
      sql: 'SELECT COUNT(*) AS n FROM audit_log WHERE entity_id=?',
      args: [c.id],
    });
    expect(Number((log.rows[0] as any).n)).toBe(0);
  });

  it('rejeita alteração inválida', async () => {
    const c = await criarCliente(admin);
    const res = await req()
      .put(`/api/clients/${c.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ ...c, status: 'Inventado' });

    expect(res.status).toBe(400);
  });

  it('devolve 404 para id inexistente', async () => {
    const res = await req()
      .put('/api/clients/nao-existe')
      .set('Authorization', `Bearer ${admin}`)
      .send(clienteExemplo());

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/clients/:id', () => {
  it('um utilizador comum não pode apagar', async () => {
    const c = await criarCliente(admin);
    const res = await req().delete(`/api/clients/${c.id}`).set('Authorization', `Bearer ${user}`);

    expect(res.status).toBe(403);

    // E o registo tem mesmo de continuar lá.
    const ainda = await db.execute({
      sql: 'SELECT COUNT(*) AS n FROM clients WHERE id=?',
      args: [c.id],
    });
    expect(Number((ainda.rows[0] as any).n)).toBe(1);
  });

  it('um administrador apaga e devolve 204', async () => {
    const c = await criarCliente(admin);
    const res = await req().delete(`/api/clients/${c.id}`).set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(204);
  });

  it('deixa rasto no histórico', async () => {
    const c = await criarCliente(admin, { name: 'Para apagar' });
    await req().delete(`/api/clients/${c.id}`).set('Authorization', `Bearer ${admin}`);

    const log = await db.execute({
      sql: 'SELECT * FROM audit_log WHERE entity_id=? AND field=?',
      args: [c.id, 'Eliminado'],
    });
    expect(log.rows).toHaveLength(1);
    // O rasto guarda nome e NIF: só o id não identifica nada depois de a linha
    // desaparecer, e o NIF é o que permite reconhecer o cliente eliminado.
    expect((log.rows[0] as any).old_value).toBe('Para apagar (NIF 501234567)');
    expect((log.rows[0] as any).user_name).toBe('Utilizador admin');
  });

  it('devolve 404 para id inexistente', async () => {
    const res = await req()
      .delete('/api/clients/nao-existe')
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(404);
  });
});
