import { randomUUID } from 'crypto';
import { db } from '../db.js';
import { validate, activitySchema } from '../validate.js';
import { asyncRouter } from '../asyncRouter.js';
import { eliminarComAuditoria } from '../eliminar.js';
import type { LinhaBD } from '../linhas.js';

export const activitiesRouter = asyncRouter();

function rowToActivity(r: LinhaBD) {
  return {
    id: r.id,
    clientId: r.client_id,
    type: r.type,
    date: r.date,
    time: r.time,
    notes: r.notes,
    spokeTo: r.spoke_to,
    createdAt: r.created_at,
  };
}

/**
 * Atividades recentes de toda a carteira, numa só chamada.
 * O Dashboard e a Equipa pediam as atividades cliente a cliente.
 */
activitiesRouter.get('/activities/recent', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 400, 2000);
  const result = await db.execute({
    sql: 'SELECT * FROM activities ORDER BY date DESC, time DESC LIMIT ?',
    args: [limit],
  });
  res.json(result.rows.map(rowToActivity));
});

activitiesRouter.get('/clients/:clientId/activities', async (req, res) => {
  const result = await db.execute({
    sql: 'SELECT * FROM activities WHERE client_id = ? ORDER BY date DESC, time DESC',
    args: [String(req.params.clientId)],
  });
  res.json(result.rows.map(rowToActivity));
});

activitiesRouter.post(
  '/clients/:clientId/activities',
  validate(activitySchema),
  async (req, res) => {
    const b = req.body;
    const id = randomUUID();
    const { clientId } = req.params;
    await db.execute({
      sql: `INSERT INTO activities (id,client_id,type,date,time,notes,spoke_to) VALUES (?,?,?,?,?,?,?)`,
      args: [id, clientId, b.type || 'Nota', b.date, b.time, b.notes || '', b.spokeTo || null],
    });
    const result = await db.execute({ sql: 'SELECT * FROM activities WHERE id = ?', args: [id] });
    res.status(201).json(rowToActivity(result.rows[0]));
  },
);

activitiesRouter.delete(
  '/activities/:id',
  ...eliminarComAuditoria({
    tabela: 'activities',
    entidade: 'activity',
    colunas: 'type, date, notes',
    rotulo: (a) => `${a.type} de ${a.date}: ${String(a.notes ?? '').slice(0, 80)}`,
  }),
);
