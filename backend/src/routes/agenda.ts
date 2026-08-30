import { randomUUID } from 'crypto';
import { db } from '../db.js';
import { validate, agendaSchema } from '../validate.js';
import { asyncRouter } from '../asyncRouter.js';
import { eliminarComAuditoria } from '../eliminar.js';
import type { LinhaBD } from '../linhas.js';

export const agendaRouter = asyncRouter();

function rowToEvent(r: LinhaBD) {
  return {
    id: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
    type: r.type,
    title: r.title,
    date: r.date,
    time: r.time,
    done: !!r.done,
  };
}

agendaRouter.get('/agenda', async (_req, res) => {
  const result = await db.execute(`
    SELECT a.*, c.name as client_name FROM agenda a
    LEFT JOIN clients c ON c.id = a.client_id
    ORDER BY a.date ASC, a.time ASC
  `);
  res.json(result.rows.map(rowToEvent));
});

agendaRouter.get('/clients/:clientId/agenda', async (req, res) => {
  const result = await db.execute({
    sql: `SELECT a.*, c.name as client_name FROM agenda a
          LEFT JOIN clients c ON c.id = a.client_id
          WHERE a.client_id = ? ORDER BY a.date ASC, a.time ASC`,
    args: [String(req.params.clientId)],
  });
  res.json(result.rows.map(rowToEvent));
});

agendaRouter.post('/agenda', validate(agendaSchema), async (req, res) => {
  const b = req.body;
  if (!b.title || !b.date) return res.status(400).json({ error: 'title e date obrigatórios' });
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO agenda (id,client_id,type,title,date,time,done) VALUES (?,?,?,?,?,?,?)`,
    args: [
      id,
      b.clientId || null,
      b.type || 'Reuniao',
      b.title,
      b.date,
      b.time || '09:00',
      b.done ? 1 : 0,
    ],
  });
  const result = await db.execute({
    sql: `SELECT a.*, c.name as client_name FROM agenda a LEFT JOIN clients c ON c.id=a.client_id WHERE a.id=?`,
    args: [id],
  });
  res.status(201).json(rowToEvent(result.rows[0]));
});

agendaRouter.put('/agenda/:id', validate(agendaSchema), async (req, res) => {
  const b = req.body;
  const id = String(req.params.id);
  await db.execute({
    sql: `UPDATE agenda SET type=?,title=?,date=?,time=?,done=? WHERE id=?`,
    args: [b.type, b.title, b.date, b.time, b.done ? 1 : 0, id],
  });
  const result = await db.execute({
    sql: `SELECT a.*, c.name as client_name FROM agenda a LEFT JOIN clients c ON c.id=a.client_id WHERE a.id=?`,
    args: [id],
  });
  if (!result.rows.length) return res.status(404).json({ error: 'não encontrado' });
  res.json(rowToEvent(result.rows[0]));
});

agendaRouter.delete(
  '/agenda/:id',
  ...eliminarComAuditoria({
    tabela: 'agenda',
    entidade: 'agenda',
    colunas: 'type, title, date, time',
    rotulo: (e) => `${e.type} "${e.title}" em ${e.date} ${e.time}`,
  }),
);
