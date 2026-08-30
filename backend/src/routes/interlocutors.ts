import { randomUUID } from 'crypto';
import { db } from '../db.js';
import { validate, interlocutorSchema } from '../validate.js';
import { asyncRouter } from '../asyncRouter.js';
import { eliminarComAuditoria } from '../eliminar.js';
import type { LinhaBD } from '../linhas.js';

export const interlocutorsRouter = asyncRouter();

function rowToInterlocutor(r: LinhaBD) {
  return {
    id: r.id,
    clientId: r.client_id,
    name: r.name,
    role: r.role,
    phone: r.phone,
    email: r.email,
  };
}

interlocutorsRouter.get('/clients/:clientId/interlocutors', async (req, res) => {
  const result = await db.execute({
    sql: 'SELECT * FROM interlocutors WHERE client_id = ? ORDER BY name ASC',
    args: [String(req.params.clientId)],
  });
  res.json(result.rows.map(rowToInterlocutor));
});

interlocutorsRouter.post(
  '/clients/:clientId/interlocutors',
  validate(interlocutorSchema),
  async (req, res) => {
    const b = req.body;
    const id = randomUUID();
    const clientId = String(req.params.clientId);
    await db.execute({
      sql: `INSERT INTO interlocutors (id,client_id,name,role,phone,email) VALUES (?,?,?,?,?,?)`,
      args: [id, clientId, b.name, b.role || null, b.phone || null, b.email || null],
    });
    const result = await db.execute({
      sql: 'SELECT * FROM interlocutors WHERE id = ?',
      args: [id],
    });
    res.status(201).json(rowToInterlocutor(result.rows[0]));
  },
);

interlocutorsRouter.put('/interlocutors/:id', validate(interlocutorSchema), async (req, res) => {
  const b = req.body;
  const id = String(req.params.id);
  await db.execute({
    sql: `UPDATE interlocutors SET name=?,role=?,phone=?,email=? WHERE id=?`,
    args: [b.name, b.role || null, b.phone || null, b.email || null, id],
  });
  const result = await db.execute({ sql: 'SELECT * FROM interlocutors WHERE id = ?', args: [id] });
  if (!result.rows.length) return res.status(404).json({ error: 'não encontrado' });
  res.json(rowToInterlocutor(result.rows[0]));
});

interlocutorsRouter.delete(
  '/interlocutors/:id',
  ...eliminarComAuditoria({
    tabela: 'interlocutors',
    entidade: 'interlocutor',
    colunas: 'name, role',
    rotulo: (i) => `${i.name}${i.role ? ` (${i.role})` : ''}`,
  }),
);
