import { randomUUID } from 'crypto';
import { db } from '../db.js';
import { validate, clientSchema } from '../validate.js';
import { asyncRouter } from '../asyncRouter.js';
import { eliminarComAuditoria } from '../eliminar.js';
import type { LinhaBD } from '../linhas.js';
import { exigirPropriedade } from '../propriedade.js';

export const clientsRouter = asyncRouter();

function rowToClient(r: LinhaBD) {
  return {
    id: r.id,
    name: r.name,
    nif: r.nif,
    sector: r.sector,
    cae: r.cae,
    status: r.status,
    contact: r.contact,
    score: r.score,
    email: r.email,
    phone: r.phone,
    website: r.website,
    address: r.address,
    city: r.city,
    notes: r.notes,
    lat: r.lat,
    lng: r.lng,
    starred: !!r.starred,
    callState: r.call_state || '',
    salespersonId: r.salesperson_id,
    parentId: r.parent_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const ORDER = 'ORDER BY starred DESC, score DESC, name ASC';

/**
 * Lista de clientes.
 *
 * Sem parâmetros devolve um array com a carteira toda — é o que a app usa,
 * porque filtra e ordena do lado do cliente e precisa mesmo de todos os
 * registos (mapa, dashboard, contagens das vistas).
 *
 * Com `?page=1` devolve `{ data, total, limit, offset }` para carteiras que
 * não cabem em memória, com teto rígido (`MAX_LIMIT`) para que ninguém possa
 * pedir tudo passando `limit=99999`.
 *
 * A paginação é opt-in de propósito: mudar a forma da resposta por omissão
 * partiria qualquer cliente já em execução — foi exatamente o que aconteceu
 * quando se tentou o contrário.
 */
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

clientsRouter.get('/clients', async (req, res) => {
  const q = String(req.query.q || '').trim();
  // `?` repetido em vez de `?1`: misturar parâmetros numerados com posicionais
  // (o LIMIT/OFFSET abaixo) confunde o SQLite.
  const where = q ? 'WHERE name LIKE ? OR nif LIKE ? OR email LIKE ? OR city LIKE ?' : '';
  const args: string[] = q ? Array(4).fill(`%${q}%`) : [];

  if (req.query.page !== '1') {
    const r = await db.execute({ sql: `SELECT * FROM clients ${where} ${ORDER}`, args });
    return res.json(r.rows.map(rowToClient));
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  const [rows, count] = await Promise.all([
    db.execute({
      sql: `SELECT * FROM clients ${where} ${ORDER} LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    }),
    db.execute({ sql: `SELECT COUNT(*) AS n FROM clients ${where}`, args }),
  ]);

  res.json({
    data: rows.rows.map(rowToClient),
    total: Number((count.rows[0] as LinhaBD).n) || 0,
    limit,
    offset,
  });
});

/**
 * Um cliente.
 *
 * Faltava. A app não dava por isso — carrega a carteira toda e escolhe em
 * memória — mas é a rota que qualquer consumidor externo tenta primeiro, e
 * respondia 404 em HTML.
 */
clientsRouter.get('/clients/:id', async (req, res) => {
  const r = await db.execute({
    sql: 'SELECT * FROM clients WHERE id = ?',
    args: [String(req.params.id)],
  });
  if (!r.rows.length) return res.status(404).json({ error: 'não encontrado' });
  res.json(rowToClient(r.rows[0]));
});

clientsRouter.post('/clients', validate(clientSchema), async (req, res) => {
  const b = req.body;
  if (!b.name) return res.status(400).json({ error: 'name é obrigatório' });
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO clients (id,name,nif,sector,cae,status,contact,score,email,phone,website,address,city,notes,lat,lng,starred,call_state,salesperson_id,parent_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      id,
      b.name,
      b.nif || null,
      b.sector || null,
      b.cae || null,
      b.status || 'Prospeto',
      b.contact || null,
      b.score ?? 50,
      b.email || null,
      b.phone || null,
      b.website || null,
      b.address || null,
      b.city || null,
      b.notes || null,
      b.lat ?? null,
      b.lng ?? null,
      b.starred ? 1 : 0,
      b.callState || '',
      b.salespersonId || null,
      b.parentId || null,
    ],
  });
  const result = await db.execute({ sql: 'SELECT * FROM clients WHERE id = ?', args: [id] });
  res.status(201).json(rowToClient(result.rows[0]));
});

/** Campos cujas alterações vale a pena registar no histórico. */
const AUDITED: [string, string][] = [
  ['name', 'Nome'],
  ['status', 'Estado'],
  ['score', 'Score'],
  ['email', 'Email'],
  ['phone', 'Telefone'],
  ['sector', 'Setor'],
  ['contact', 'Contacto'],
  ['city', 'Localidade'],
  ['salespersonId', 'Comercial'],
  ['callState', 'Agendamento'],
];

// A escrita sobre a ficha de um cliente respeita a propriedade: um comercial
// não altera a carteira de um colega. Ver propriedade.ts para a política.
clientsRouter.put('/clients/:id', exigirPropriedade, validate(clientSchema), async (req, res) => {
  const b = req.body;
  const id = String(req.params.id);

  // Snapshot antes de gravar, para o histórico de alterações
  const before = await db.execute({ sql: 'SELECT * FROM clients WHERE id=?', args: [id] });
  const prev = before.rows[0] as LinhaBD | undefined;
  if (!prev) return res.status(404).json({ error: 'não encontrado' });

  const atualizacao = {
    sql: `UPDATE clients SET name=?,nif=?,sector=?,cae=?,status=?,contact=?,score=?,email=?,phone=?,
          website=?,address=?,city=?,notes=?,lat=?,lng=?,starred=?,call_state=?,salesperson_id=?,parent_id=?,
          updated_at=datetime('now') WHERE id=?`,
    args: [
      b.name,
      b.nif || null,
      b.sector || null,
      b.cae || null,
      b.status,
      b.contact || null,
      b.score ?? 50,
      b.email || null,
      b.phone || null,
      b.website || null,
      b.address || null,
      b.city || null,
      b.notes || null,
      b.lat ?? null,
      b.lng ?? null,
      b.starred ? 1 : 0,
      b.callState || '',
      b.salespersonId || null,
      b.parentId || null,
      id,
    ],
  };

  /* Regista o que mudou e QUEM mudou (audit trail — padrão Salesforce/Dynamics).
     O autor vem do token: um histórico sem autor não serve como auditoria.

     A atualização e as linhas de histórico vão na MESMA transação. Em
     sequência, uma falha entre as duas deixava o histórico a afirmar uma
     alteração que nunca chegou a ser gravada — uma auditoria que mente é pior
     do que auditoria nenhuma. */
  const prevClient = rowToClient(prev) as LinhaBD;
  const who = req.user;
  const linhasHistorico = AUDITED.filter(([key]) => {
    const newV = (b as LinhaBD)[key];
    return newV !== undefined && String(prevClient[key] ?? '') !== String(newV ?? '');
  }).map(([key, label]) => ({
    sql: `INSERT INTO audit_log (entity,entity_id,field,old_value,new_value,user_id,user_name)
          VALUES (?,?,?,?,?,?,?)`,
    args: [
      'client',
      id,
      label as string,
      String(prevClient[key] ?? ''),
      String((b as LinhaBD)[key] ?? ''),
      who?.id ?? null,
      who?.name ?? null,
    ],
  }));

  await db.batch([atualizacao, ...linhasHistorico], 'write');

  const result = await db.execute({ sql: 'SELECT * FROM clients WHERE id = ?', args: [id] });
  res.json(rowToClient(result.rows[0]));
});

// Apagar um cliente leva atrás atividades, negócios e interlocutores (CASCADE).
// É irreversível, por isso fica reservado a administradores.
clientsRouter.delete(
  '/clients/:id',
  ...eliminarComAuditoria({
    tabela: 'clients',
    entidade: 'client',
    colunas: 'name, nif',
    rotulo: (c) => `${c.name}${c.nif ? ` (NIF ${c.nif})` : ''}`,
  }),
);
