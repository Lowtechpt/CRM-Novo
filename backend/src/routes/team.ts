import { randomUUID } from 'crypto';
import { db } from '../db.js';
import { validate, salespersonSchema, competitionSchema } from '../validate.js';
import { asyncRouter } from '../asyncRouter.js';
import { eliminarComAuditoria } from '../eliminar.js';
import type { LinhaBD } from '../linhas.js';

export const teamRouter = asyncRouter();

/* ── Comerciais / Equipa ── */

teamRouter.get('/salespeople', async (_req, res) => {
  const r = await db.execute('SELECT * FROM salespeople ORDER BY name ASC');
  res.json(r.rows);
});

teamRouter.post('/salespeople', validate(salespersonSchema), async (req, res) => {
  const b = req.body;
  if (!b.name) return res.status(400).json({ error: 'name obrigatório' });
  const id = randomUUID();
  await db.execute({
    sql: 'INSERT INTO salespeople (id,name,email,phone,role) VALUES (?,?,?,?,?)',
    args: [id, b.name, b.email || null, b.phone || null, b.role || null],
  });
  const r = await db.execute({ sql: 'SELECT * FROM salespeople WHERE id=?', args: [id] });
  res.status(201).json(r.rows[0]);
});

/**
 * Editar um comercial.
 *
 * Faltava, e a única forma de corrigir um nome mal escrito ou um email
 * desatualizado era apagar e recriar — o que rebentava a ligação histórica
 * aos clientes, às atividades e aos registos de concorrência, que guardam o
 * id antigo.
 */
teamRouter.put('/salespeople/:id', validate(salespersonSchema), async (req, res) => {
  const b = req.body;
  const id = String(req.params.id);

  const existe = await db.execute({ sql: 'SELECT 1 FROM salespeople WHERE id=?', args: [id] });
  if (!existe.rows.length) return res.status(404).json({ error: 'não encontrado' });

  await db.execute({
    sql: 'UPDATE salespeople SET name=?,email=?,phone=?,role=? WHERE id=?',
    args: [b.name, b.email || null, b.phone || null, b.role || null, id],
  });

  const r = await db.execute({ sql: 'SELECT * FROM salespeople WHERE id=?', args: [id] });
  res.json(r.rows[0]);
});

teamRouter.delete(
  '/salespeople/:id',
  ...eliminarComAuditoria({
    tabela: 'salespeople',
    entidade: 'salesperson',
    colunas: 'name, email',
    rotulo: (p) => String(p.name ?? ''),
  }),
);

/* ── Concorrência ── */

function rowToComp(r: LinhaBD) {
  return {
    id: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
    clientSector: r.client_sector,
    competitor: r.competitor,
    competitorProduct: r.competitor_product,
    ourProduct: r.our_product,
    competitorValue: r.competitor_value,
    ourValue: r.our_value,
    status: r.status || 'Em disputa',
    salespersonId: r.salesperson_id,
    salespersonName: r.salesperson_name,
    dealId: r.deal_id,
    notes: r.notes,
    date: r.date,
  };
}

const COMP_SELECT = `
  SELECT k.*, c.name AS client_name, c.sector AS client_sector, s.name AS salesperson_name
  FROM competition k
  LEFT JOIN clients c ON c.id = k.client_id
  LEFT JOIN salespeople s ON s.id = k.salesperson_id
`;

teamRouter.get('/competition', async (_req, res) => {
  const r = await db.execute(`${COMP_SELECT} ORDER BY k.date DESC`);
  res.json(r.rows.map(rowToComp));
});

teamRouter.get('/clients/:clientId/competition', async (req, res) => {
  const r = await db.execute({
    sql: `${COMP_SELECT} WHERE k.client_id = ? ORDER BY k.date DESC`,
    args: [String(req.params.clientId)],
  });
  res.json(r.rows.map(rowToComp));
});

const compArgs = (b: LinhaBD) => [
  b.clientId || null,
  b.competitor,
  b.competitorProduct || null,
  b.ourProduct || null,
  b.competitorValue != null && b.competitorValue !== '' ? Number(b.competitorValue) : null,
  b.ourValue != null && b.ourValue !== '' ? Number(b.ourValue) : null,
  b.status || 'Em disputa',
  b.salespersonId || null,
  b.dealId || null,
  b.notes || null,
  b.date || new Date().toISOString().slice(0, 10),
];

teamRouter.post('/competition', validate(competitionSchema), async (req, res) => {
  const b = req.body;
  if (!b.competitor) return res.status(400).json({ error: 'competitor obrigatório' });
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO competition
          (client_id,competitor,competitor_product,our_product,competitor_value,our_value,status,salesperson_id,deal_id,notes,date,id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [...compArgs(b), id],
  });
  const r = await db.execute({ sql: `${COMP_SELECT} WHERE k.id=?`, args: [id] });
  res.status(201).json(rowToComp(r.rows[0]));
});

teamRouter.put('/competition/:id', validate(competitionSchema), async (req, res) => {
  const b = req.body;
  const id = String(req.params.id);
  await db.execute({
    sql: `UPDATE competition SET client_id=?,competitor=?,competitor_product=?,our_product=?,
          competitor_value=?,our_value=?,status=?,salesperson_id=?,deal_id=?,notes=?,date=? WHERE id=?`,
    args: [...compArgs(b), id],
  });
  const r = await db.execute({ sql: `${COMP_SELECT} WHERE k.id=?`, args: [id] });
  if (!r.rows.length) return res.status(404).json({ error: 'não encontrado' });
  res.json(rowToComp(r.rows[0]));
});

teamRouter.delete(
  '/competition/:id',
  ...eliminarComAuditoria({
    tabela: 'competition',
    entidade: 'competition',
    colunas: 'competitor, status',
    rotulo: (c) => `${c.competitor} (${c.status})`,
  }),
);
