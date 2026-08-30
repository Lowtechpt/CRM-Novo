import { randomUUID } from 'crypto';
import { db } from '../db.js';
import { validate, dealSchema } from '../validate.js';
import { asyncRouter } from '../asyncRouter.js';
import { eliminarComAuditoria } from '../eliminar.js';
import type { LinhaBD } from '../linhas.js';

export const dealsRouter = asyncRouter();

function rowToDeal(r: LinhaBD) {
  return {
    id: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
    title: r.title,
    value: r.value,
    stage: r.stage,
    probability: r.probability,
    recurringValue: r.recurring_value || 0,
    dueDate: r.due_date,
    createdAt: r.created_at,
  };
}

dealsRouter.get('/deals', async (_req, res) => {
  const result = await db.execute(`
    SELECT d.*, c.name as client_name FROM deals d
    JOIN clients c ON c.id = d.client_id
    ORDER BY d.created_at DESC
  `);
  res.json(result.rows.map(rowToDeal));
});

dealsRouter.get('/clients/:clientId/deals', async (req, res) => {
  const result = await db.execute({
    sql: `SELECT d.*, c.name as client_name FROM deals d
          JOIN clients c ON c.id = d.client_id
          WHERE d.client_id = ? ORDER BY d.created_at DESC`,
    args: [String(req.params.clientId)],
  });
  res.json(result.rows.map(rowToDeal));
});

dealsRouter.post('/deals', validate(dealSchema), async (req, res) => {
  const b = req.body;
  if (!b.clientId || !b.title)
    return res.status(400).json({ error: 'clientId e title obrigatórios' });
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO deals (id,client_id,title,value,stage,probability,due_date,recurring_value) VALUES (?,?,?,?,?,?,?,?)`,
    args: [
      id,
      b.clientId,
      b.title,
      b.value ?? 0,
      b.stage || 'Prospecao',
      b.probability ?? 20,
      b.dueDate || null,
      b.recurringValue ?? 0,
    ],
  });
  const result = await db.execute({
    sql: `SELECT d.*, c.name as client_name FROM deals d JOIN clients c ON c.id=d.client_id WHERE d.id=?`,
    args: [id],
  });
  res.status(201).json(rowToDeal(result.rows[0]));
});

dealsRouter.put('/deals/:id', validate(dealSchema), async (req, res) => {
  const b = req.body;
  const id = String(req.params.id);
  await db.execute({
    sql: `UPDATE deals SET title=?,value=?,stage=?,probability=?,due_date=?,recurring_value=? WHERE id=?`,
    args: [
      b.title,
      b.value ?? 0,
      b.stage,
      b.probability ?? 20,
      b.dueDate || null,
      b.recurringValue ?? 0,
      id,
    ],
  });
  const result = await db.execute({
    sql: `SELECT d.*, c.name as client_name FROM deals d JOIN clients c ON c.id=d.client_id WHERE d.id=?`,
    args: [id],
  });
  if (!result.rows.length) return res.status(404).json({ error: 'não encontrado' });
  res.json(rowToDeal(result.rows[0]));
});

dealsRouter.delete(
  '/deals/:id',
  ...eliminarComAuditoria({
    tabela: 'deals',
    entidade: 'deal',
    colunas: 'title, value, stage',
    rotulo: (d) => `"${d.title}" (${d.value}€, ${d.stage})`,
  }),
);
