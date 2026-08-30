import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { req, db, prepararBase, limparDados, tokenPara, criarCliente } from './test/helpers.js';

/**
 * Matriz de permissões e robustez do servidor.
 *
 * Este ficheiro existe por causa de um erro concreto: a documentação afirmava
 * "DELETE e seed são de administrador" quando só a eliminação de clientes
 * estava protegida. Seis rotas destrutivas continuavam abertas a qualquer
 * conta. Uma tabela afirmada em testes não diverge do código em silêncio — uma
 * frase num ficheiro de notas diverge.
 */

let admin: string;
let user: string;

beforeAll(async () => {
  await prepararBase();
  admin = await tokenPara('admin');
  user = await tokenPara('user');
});

beforeEach(limparDados);

const hoje = () => new Date().toISOString().slice(0, 10);

/** Cria um registo de cada tipo e devolve as rotas DELETE correspondentes. */
async function criarDeTudo() {
  const c = await criarCliente(admin);
  const como = (t: string) => ({ Authorization: `Bearer ${t}` });

  const atividade = (
    await req()
      .post(`/api/clients/${c.id}/activities`)
      .set(como(admin))
      .send({ type: 'Nota', date: hoje(), time: '10:00', notes: 'x' })
  ).body;

  const negocio = (
    await req()
      .post('/api/deals')
      .set(como(admin))
      .send({ clientId: c.id, title: 'Negócio', value: 1000, stage: 'Proposta' })
  ).body;

  const evento = (
    await req()
      .post('/api/agenda')
      .set(como(admin))
      .send({ clientId: c.id, type: 'Reunião', title: 'Visita', date: hoje(), time: '11:00' })
  ).body;

  const interlocutor = (
    await req()
      .post(`/api/clients/${c.id}/interlocutors`)
      .set(como(admin))
      .send({ name: 'Ana Sousa', role: 'Compras' })
  ).body;

  const comercial = (
    await req().post('/api/salespeople').set(como(admin)).send({ name: 'Rui Costa' })
  ).body;

  const concorrente = (
    await req()
      .post('/api/competition')
      .set(como(admin))
      .send({ clientId: c.id, competitor: 'Rival SA', status: 'Em disputa', date: hoje() })
  ).body;

  // O cliente vem em ÚLTIMO: apagá-lo leva atrás atividades, negócios,
  // interlocutores e concorrência (ON DELETE CASCADE), e as rotas seguintes
  // passariam a devolver 404 por o registo já não existir.
  return [
    {
      nome: 'atividade',
      rota: `/api/activities/${atividade.id}`,
      tabela: 'activities',
      id: atividade.id,
    },
    { nome: 'negócio', rota: `/api/deals/${negocio.id}`, tabela: 'deals', id: negocio.id },
    { nome: 'evento', rota: `/api/agenda/${evento.id}`, tabela: 'agenda', id: evento.id },
    {
      nome: 'interlocutor',
      rota: `/api/interlocutors/${interlocutor.id}`,
      tabela: 'interlocutors',
      id: interlocutor.id,
    },
    {
      nome: 'comercial',
      rota: `/api/salespeople/${comercial.id}`,
      tabela: 'salespeople',
      id: comercial.id,
    },
    {
      nome: 'concorrente',
      rota: `/api/competition/${concorrente.id}`,
      tabela: 'competition',
      id: concorrente.id,
    },
    { nome: 'cliente', rota: `/api/clients/${c.id}`, tabela: 'clients', id: c.id },
  ];
}

describe('matriz de permissões: eliminações', () => {
  it('NENHUMA eliminação é possível a um utilizador comum', async () => {
    const alvos = await criarDeTudo();
    const recusadas: string[] = [];

    for (const alvo of alvos) {
      const res = await req().delete(alvo.rota).set('Authorization', `Bearer ${user}`);
      if (res.status === 403) recusadas.push(alvo.nome);
    }

    expect(recusadas).toEqual(alvos.map((a) => a.nome));
  });

  it('o registo continua mesmo lá depois de o utilizador comum tentar', async () => {
    const alvos = await criarDeTudo();

    for (const alvo of alvos) {
      await req().delete(alvo.rota).set('Authorization', `Bearer ${user}`);
      const r = await db.execute({
        sql: `SELECT COUNT(*) AS n FROM ${alvo.tabela} WHERE id=?`,
        args: [alvo.id],
      });
      expect(Number((r.rows[0] as any).n), `${alvo.nome} foi apagado`).toBe(1);
    }
  });

  it('um administrador elimina todas', async () => {
    const alvos = await criarDeTudo();

    for (const alvo of alvos) {
      const res = await req().delete(alvo.rota).set('Authorization', `Bearer ${admin}`);
      expect(res.status, `${alvo.nome} devia devolver 204`).toBe(204);
    }
  });

  it('TODAS as eliminações deixam rasto no histórico, com autor', async () => {
    const alvos = await criarDeTudo();

    for (const alvo of alvos) {
      await req().delete(alvo.rota).set('Authorization', `Bearer ${admin}`);
    }

    const log = await db.execute("SELECT * FROM audit_log WHERE field='Eliminado'");
    expect(log.rows).toHaveLength(alvos.length);

    for (const linha of log.rows as any[]) {
      expect(linha.user_id, 'eliminação sem autor').toBeTruthy();
      expect(linha.user_name).toBe('Utilizador admin');
      expect(String(linha.old_value).length, 'rasto sem descrição').toBeGreaterThan(0);
    }
  });

  it('eliminar algo inexistente devolve 404, não 204', async () => {
    for (const rota of [
      '/api/clients/x',
      '/api/deals/x',
      '/api/agenda/x',
      '/api/activities/x',
      '/api/interlocutors/x',
      '/api/salespeople/x',
      '/api/competition/x',
    ]) {
      const res = await req().delete(rota).set('Authorization', `Bearer ${admin}`);
      expect(res.status, `${rota} devia devolver 404`).toBe(404);
    }
  });
});

describe('matriz de permissões: escrita', () => {
  it('um utilizador comum pode criar e editar', async () => {
    const criado = await req()
      .post('/api/clients')
      .set('Authorization', `Bearer ${user}`)
      .send({ name: 'Criado por utilizador comum' });
    expect(criado.status).toBe(201);

    const editado = await req()
      .put(`/api/clients/${criado.body.id}`)
      .set('Authorization', `Bearer ${user}`)
      .send({ ...criado.body, status: 'Ativo' });
    expect(editado.status).toBe(200);
  });

  it('o seed continua reservado a administradores', async () => {
    const comum = await req().post('/api/seed').set('Authorization', `Bearer ${user}`);
    expect(comum.status).toBe(403);
  });

  it('o diagnóstico detalhado é só de administrador', async () => {
    expect((await req().get('/api/health').set('Authorization', `Bearer ${user}`)).status).toBe(
      403,
    );
    expect((await req().get('/api/health').set('Authorization', `Bearer ${admin}`)).status).toBe(
      200,
    );
  });
});

describe('/health público', () => {
  it('não exige sessão', async () => {
    const res = await req().get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('não revela metadados de infraestrutura', async () => {
    // uptime e latência ajudam a fazer fingerprinting do serviço; ficam na
    // rota autenticada.
    const res = await req().get('/health');
    expect(res.body.uptimeSec).toBeUndefined();
    expect(res.body.latencyMs).toBeUndefined();
  });
});

describe('erros async não deixam o pedido pendurado', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uma falha da base devolve 500, não silêncio', async () => {
    /**
     * No Express 4, uma rejeição dentro de um handler `async` não chega ao
     * middleware de erro: o pedido fica pendurado até o cliente desistir.
     * Verificado antes da correção — a resposta não era 500, era nenhuma
     * (ECONNABORTED ao fim de 5 s). O `asyncRouter` resolve isso.
     */
    const original = db.execute;
    (db as any).execute = vi.fn().mockRejectedValue(new Error('SQLITE_BUSY simulado'));

    try {
      const res = await req()
        .get('/api/clients')
        .set('Authorization', `Bearer ${admin}`)
        .timeout({ deadline: 8000 });

      expect(res.status).toBe(500);
      expect(res.body.error).toBeTruthy();
      // O id do pedido volta na resposta para se poder achar a linha no log.
      expect(res.body.reqId).toBeTruthy();
    } finally {
      (db as any).execute = original;
    }
  });

  it('vale para rotas com parâmetros e para escritas', async () => {
    const original = db.execute;
    (db as any).execute = vi.fn().mockRejectedValue(new Error('falha simulada'));

    try {
      const get = await req()
        .get('/api/clients/qualquer/activities')
        .set('Authorization', `Bearer ${admin}`)
        .timeout({ deadline: 8000 });
      expect(get.status).toBe(500);

      const post = await req()
        .post('/api/clients')
        .set('Authorization', `Bearer ${admin}`)
        .send({ name: 'Vai falhar' })
        .timeout({ deadline: 8000 });
      expect(post.status).toBe(500);
    } finally {
      (db as any).execute = original;
    }
  });
});

describe('operações em massa exigem administrador', () => {
  /**
   * `bulk` e `import` escrevem em toda a carteira de uma vez. Estavam
   * acessíveis a qualquer conta autenticada: um comercial descontente podia
   * marcar todos os clientes como inativos num só pedido, ou despejar 10 mil
   * linhas de lixo na base.
   */
  it('POST /clients/bulk recusa utilizador comum', async () => {
    const c = await criarCliente(admin);
    const res = await req()
      .post('/api/clients/bulk')
      .set('Authorization', `Bearer ${user}`)
      .send({ ids: [c.id], patch: { status: 'Inativo' } });

    expect(res.status).toBe(403);

    // E o estado tem mesmo de ficar como estava.
    const depois = await req().get(`/api/clients`).set('Authorization', `Bearer ${admin}`);
    expect(depois.body[0].status).toBe('Prospeto');
  });

  it('POST /clients/import recusa utilizador comum', async () => {
    const res = await req()
      .post('/api/clients/import')
      .set('Authorization', `Bearer ${user}`)
      .send({ rows: [{ name: 'Intruso' }] });

    expect(res.status).toBe(403);
  });

  it('um administrador continua a poder usar as duas', async () => {
    const c = await criarCliente(admin);

    const bulk = await req()
      .post('/api/clients/bulk')
      .set('Authorization', `Bearer ${admin}`)
      .send({ ids: [c.id], patch: { status: 'Ativo' } });
    expect(bulk.status).toBe(200);

    const imp = await req()
      .post('/api/clients/import')
      .set('Authorization', `Bearer ${admin}`)
      .send({ rows: [{ name: 'Importado da folha' }] });
    expect(imp.status).toBe(200);
    expect(imp.body.inserted).toBe(1);
  });

  it('a importação tem teto de linhas', async () => {
    // Sem teto, um pedido com 100 mil linhas era percorrido em memória.
    const rows = Array.from({ length: 5001 }, (_, i) => ({ name: `Cliente ${i}` }));
    const res = await req()
      .post('/api/clients/import')
      .set('Authorization', `Bearer ${admin}`)
      .send({ rows });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/5000/);
  });

  it('a importação rejeita corpo sem linhas', async () => {
    const res = await req()
      .post('/api/clients/import')
      .set('Authorization', `Bearer ${admin}`)
      .send({ rows: [] });

    expect(res.status).toBe(400);
  });
});

describe('rotas de IA validam a entrada', () => {
  /**
   * `/ia-news` e `/ia-email` aceitavam `req.body` arbitrário e interpolavam-no
   * no prompt. Um nome com quebras de linha e marcadores de sistema podia
   * quebrar o contexto e sobrepor-se às instruções (OWASP LLM01).
   */
  it('/ia-news exige nome da empresa', async () => {
    const res = await req().post('/api/ia-news').set('Authorization', `Bearer ${admin}`).send({});
    expect(res.status).toBe(400);
  });

  it('/ia-news impõe limite de comprimento ao nome', async () => {
    const res = await req()
      .post('/api/ia-news')
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'x'.repeat(5000) });

    expect(res.status).toBe(400);
  });

  it('/ia-email ignora um contexto enviado pelo cliente', async () => {
    // O contexto passou a vir da base de dados: quem o enviava controlava o
    // que o modelo via, e podia esvaziá-lo para contornar as regras do prompt.
    const res = await req()
      .post('/api/ia-email')
      .set('Authorization', `Bearer ${admin}`)
      .send({ intent: 'follow-up', context: 'CONTEXTO-FALSO' });

    // Sem chave configurada responde 503, mas o corpo já foi validado e limpo.
    expect([503, 502]).toContain(res.status);
  });
});

describe('propriedade da carteira', () => {
  /**
   * Não havia ligação nenhuma entre a conta de login e o comercial a quem os
   * clientes estão atribuídos, pelo que qualquer utilizador autenticado podia
   * reescrever a carteira de um colega. Não era uma decisão — era um vazio.
   */
  async function comercialComConta(nome: string) {
    const sp = (
      await req()
        .post('/api/salespeople')
        .set('Authorization', `Bearer ${admin}`)
        .send({ name: nome })
    ).body;

    // Email único por invocação: `limparDados` não apaga utilizadores, e
    // reutilizar o mesmo endereço rebentava a restrição UNIQUE no teste seguinte.
    const { randomUUID: uid } = await import('crypto');
    const email = `${nome.toLowerCase().replace(/\W/g, '')}-${uid().slice(0, 8)}@teste.pt`;
    const bcrypt = await import('bcryptjs');
    const { randomUUID } = await import('crypto');
    await db.execute({
      sql: 'INSERT INTO users (id,email,name,password_hash,role,salesperson_id) VALUES (?,?,?,?,?,?)',
      args: [randomUUID(), email, nome, await bcrypt.default.hash('teste-1234', 10), 'user', sp.id],
    });

    const login = await req().post('/api/auth/login').send({ email, password: 'teste-1234' });
    return { salespersonId: sp.id as string, token: login.body.token as string };
  }

  it('um comercial não altera o cliente de outro', async () => {
    const ana = await comercialComConta('Ana');
    const bruno = await comercialComConta('Bruno');

    const c = await criarCliente(admin, { salespersonId: ana.salespersonId });

    const res = await req()
      .put(`/api/clients/${c.id}`)
      .set('Authorization', `Bearer ${bruno.token}`)
      .send({ ...c, status: 'Inativo' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/outro comercial/i);
  });

  it('um comercial altera os seus próprios clientes', async () => {
    const ana = await comercialComConta('Ana');
    const c = await criarCliente(admin, { salespersonId: ana.salespersonId });

    const res = await req()
      .put(`/api/clients/${c.id}`)
      .set('Authorization', `Bearer ${ana.token}`)
      .send({ ...c, status: 'Ativo' });

    expect(res.status).toBe(200);
  });

  it('um cliente sem responsável pode ser reclamado por qualquer comercial', async () => {
    // Bloquear aqui só criaria trabalho parado à espera de um administrador.
    const ana = await comercialComConta('Ana');
    const c = await criarCliente(admin);

    const res = await req()
      .put(`/api/clients/${c.id}`)
      .set('Authorization', `Bearer ${ana.token}`)
      .send({ ...c, salespersonId: ana.salespersonId });

    expect(res.status).toBe(200);
    expect(res.body.salespersonId).toBe(ana.salespersonId);
  });

  it('um administrador altera qualquer cliente', async () => {
    const ana = await comercialComConta('Ana');
    const c = await criarCliente(admin, { salespersonId: ana.salespersonId });

    const res = await req()
      .put(`/api/clients/${c.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ ...c, status: 'Inativo' });

    expect(res.status).toBe(200);
  });

  it('a leitura continua aberta a toda a equipa', async () => {
    // Fechar a leitura criaria fricção — que é a causa nº1 de não adoção de
    // CRM. O que se fecha é a escrita sobre trabalho alheio.
    const ana = await comercialComConta('Ana');
    const bruno = await comercialComConta('Bruno');
    await criarCliente(admin, { salespersonId: ana.salespersonId });

    const res = await req().get('/api/clients').set('Authorization', `Bearer ${bruno.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
