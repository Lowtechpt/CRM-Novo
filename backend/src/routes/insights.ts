import { db } from '../db.js';
import { validate, bulkSchema, importSchema } from '../validate.js';
import { asyncRouter } from '../asyncRouter.js';
import { requireRole } from '../auth.js';
import type { InStatement } from '@libsql/client';
import type { LinhaBD } from '../linhas.js';

export const insightsRouter = asyncRouter();

const DAY = 86400000;
const daysSince = (iso?: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null;

/* ══════════════ SCORING AUTOMÁTICO ══════════════
   Nos Top 5 isto só existe em tiers altos (Zia Enterprise+, Einstein,
   HubSpot Enterprise). Aqui é calculado a partir de sinais que já temos. */

interface ScoreBreak {
  label: string;
  points: number;
  detail: string;
}

function scoreFor(o: {
  lastActivity: string | null;
  activityCount: number;
  interlocutors: number;
  openValue: number;
  wonValue: number;
  hasEmail: boolean;
  hasPhone: boolean;
  competitorInstalled: boolean;
  nextEvent: string | null;
  status: string;
}): { score: number; breakdown: ScoreBreak[] } {
  const b: ScoreBreak[] = [];

  // Recência de contacto — o sinal mais forte de saúde da relação
  const d = daysSince(o.lastActivity);
  if (d == null) b.push({ label: 'Contacto', points: 0, detail: 'Nunca contactado' });
  else if (d <= 7) b.push({ label: 'Contacto', points: 30, detail: `Há ${d} dias` });
  else if (d <= 30) b.push({ label: 'Contacto', points: 22, detail: `Há ${d} dias` });
  else if (d <= 60) b.push({ label: 'Contacto', points: 10, detail: `Há ${d} dias` });
  else b.push({ label: 'Contacto', points: 0, detail: `Há ${d} dias — arrefecido` });

  // Volume de interação
  const act = Math.min(15, o.activityCount * 3);
  b.push({ label: 'Histórico', points: act, detail: `${o.activityCount} atividades` });

  // Rede de contactos dentro do cliente
  const ppl = Math.min(15, o.interlocutors * 5);
  b.push({ label: 'Interlocutores', points: ppl, detail: `${o.interlocutors} pessoas` });

  // Dinheiro em jogo
  const money =
    o.openValue >= 50000
      ? 20
      : o.openValue >= 20000
        ? 15
        : o.openValue >= 5000
          ? 10
          : o.openValue > 0
            ? 5
            : 0;
  b.push({
    label: 'Pipeline aberto',
    points: money,
    detail: `€${o.openValue.toLocaleString('pt-PT')}`,
  });

  // Histórico de compra
  const won = o.wonValue > 0 ? 10 : 0;
  b.push({
    label: 'Já comprou',
    points: won,
    detail: won ? `€${o.wonValue.toLocaleString('pt-PT')}` : 'Ainda não',
  });

  // Próximo passo marcado
  const next = o.nextEvent ? 10 : 0;
  b.push({
    label: 'Próximo passo',
    points: next,
    detail: o.nextEvent ? o.nextEvent : 'Nada agendado',
  });

  // Dados de contacto completos
  const reach = (o.hasEmail ? 3 : 0) + (o.hasPhone ? 2 : 0);
  b.push({
    label: 'Contactabilidade',
    points: reach,
    detail:
      `${o.hasEmail ? 'email' : ''}${o.hasEmail && o.hasPhone ? ' + ' : ''}${o.hasPhone ? 'telefone' : ''}` ||
      'Sem contactos',
  });

  // Penalizações
  if (o.competitorInstalled)
    b.push({ label: 'Concorrente instalado', points: -10, detail: 'Risco de bloqueio' });
  if (o.status === 'Inativo')
    b.push({ label: 'Cliente inativo', points: -15, detail: 'Marcado como inativo' });

  const raw = b.reduce((s, x) => s + x.points, 0);
  return { score: Math.max(0, Math.min(100, raw)), breakdown: b };
}

/**
 * Reúne os sinais dos clientes numa única passagem.
 *
 * Com `clientId`, restringe as seis consultas a esse cliente. É a diferença
 * entre varrer a base inteira e ler algumas linhas: a rota `/clients/:id/score`
 * calcula UM cliente e fazia seis varrimentos completos para isso, com tudo
 * carregado no heap do Node. Sem argumento, o comportamento é o de antes —
 * as rotas de carteira (silêncio, briefing, recálculo) precisam mesmo de tudo.
 */
async function gatherSignals(clientId?: string) {
  const so = (coluna: string) => (clientId ? ` WHERE ${coluna} = ?` : '');
  const arg = clientId ? [clientId] : [];
  const q = (sql: string) => db.execute({ sql, args: arg });

  const [clients, acts, deals, agenda, inter, comp] = await Promise.all([
    q(`SELECT * FROM clients${so('id')}`),
    q(`SELECT client_id, date FROM activities${so('client_id')}`),
    q(`SELECT client_id, value, stage FROM deals${so('client_id')}`),
    q(
      `SELECT client_id, date, time, type, done FROM agenda WHERE done = 0${
        clientId ? ' AND client_id = ?' : ''
      }`,
    ),
    q(`SELECT client_id FROM interlocutors${so('client_id')}`),
    q(`SELECT client_id, status FROM competition${so('client_id')}`),
  ]);

  const lastAct = new Map<string, string>();
  const actCount = new Map<string, number>();
  for (const r of acts.rows as LinhaBD[]) {
    actCount.set(r.client_id, (actCount.get(r.client_id) || 0) + 1);
    const prev = lastAct.get(r.client_id);
    if (!prev || r.date > prev) lastAct.set(r.client_id, r.date);
  }

  const openVal = new Map<string, number>();
  const wonVal = new Map<string, number>();
  for (const r of deals.rows as LinhaBD[]) {
    if (['Ganho', 'Onboarding', 'Em serviço', 'Renovação'].includes(r.stage))
      wonVal.set(r.client_id, (wonVal.get(r.client_id) || 0) + (r.value || 0));
    else if (r.stage !== 'Perdido')
      openVal.set(r.client_id, (openVal.get(r.client_id) || 0) + (r.value || 0));
  }

  const today = new Date().toISOString().slice(0, 10);
  const nextEv = new Map<string, string>();
  for (const r of agenda.rows as LinhaBD[]) {
    if (!r.client_id || r.date < today) continue;
    const cur = nextEv.get(r.client_id);
    if (!cur || r.date < cur) nextEv.set(r.client_id, `${r.date} · ${r.type}`);
  }

  const interCount = new Map<string, number>();
  for (const r of inter.rows as LinhaBD[])
    interCount.set(r.client_id, (interCount.get(r.client_id) || 0) + 1);

  const installed = new Set<string>();
  for (const r of comp.rows as LinhaBD[])
    if (r.status === 'Instalado' && r.client_id) installed.add(r.client_id);

  return {
    clients: clients.rows as LinhaBD[],
    lastAct,
    actCount,
    openVal,
    wonVal,
    nextEv,
    interCount,
    installed,
  };
}

function signalsOf(c: LinhaBD, s: Awaited<ReturnType<typeof gatherSignals>>) {
  return {
    lastActivity: s.lastAct.get(c.id) || null,
    activityCount: s.actCount.get(c.id) || 0,
    interlocutors: s.interCount.get(c.id) || 0,
    openValue: s.openVal.get(c.id) || 0,
    wonValue: s.wonVal.get(c.id) || 0,
    hasEmail: !!c.email,
    hasPhone: !!c.phone,
    competitorInstalled: s.installed.has(c.id),
    nextEvent: s.nextEv.get(c.id) || null,
    status: c.status,
  };
}

/** Score calculado de um cliente, com a decomposição para a UI mostrar. */
insightsRouter.get('/clients/:id/score', async (req, res) => {
  const s = await gatherSignals(req.params.id);
  const c = s.clients.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'não encontrado' });
  res.json(scoreFor(signalsOf(c, s)));
});

/** Recalcula e grava o score de toda a carteira. */
insightsRouter.post('/scoring/recalculate', async (_req, res) => {
  const s = await gatherSignals();
  let changed = 0;
  for (const c of s.clients) {
    const { score } = scoreFor(signalsOf(c, s));
    if (score !== c.score) {
      await db.execute({ sql: 'UPDATE clients SET score=? WHERE id=?', args: [score, c.id] });
      changed++;
    }
  }
  res.json({ ok: true, total: s.clients.length, changed });
});

/* ══════════════ CUSTO DO SILÊNCIO ══════════════
   Métrica original: quanto pipeline está parado por falta de contacto.
   Nenhum dos Top 5 mostra isto. */
insightsRouter.get('/insights/silence', async (_req, res) => {
  const s = await gatherSignals();
  const buckets = { '30': 0, '60': 0, '90': 0 };
  const items: LinhaBD[] = [];

  for (const c of s.clients) {
    const open = s.openVal.get(c.id) || 0;
    if (open <= 0) continue;
    const d = daysSince(s.lastAct.get(c.id) || null);
    if (d == null || d > 30) {
      const days = d ?? 999;
      if (days > 90) buckets['90'] += open;
      else if (days > 60) buckets['60'] += open;
      else buckets['30'] += open;
      items.push({
        id: c.id,
        name: c.name,
        value: open,
        days: d,
        city: c.city,
        status: c.status,
        nextEvent: s.nextEv.get(c.id) || null,
      });
    }
  }

  items.sort((a, b) => b.value - a.value);
  const total = buckets['30'] + buckets['60'] + buckets['90'];
  res.json({ total, buckets, items: items.slice(0, 25), count: items.length });
});

/* ══════════════ BRIEFING DIÁRIO ══════════════ */
insightsRouter.get('/insights/briefing', async (_req, res) => {
  const s = await gatherSignals();
  const today = new Date().toISOString().slice(0, 10);

  const agenda = await db.execute({
    sql: `SELECT a.*, c.name AS client_name FROM agenda a
          LEFT JOIN clients c ON c.id = a.client_id
          WHERE a.done = 0 AND a.date <= ? ORDER BY a.date ASC, a.time ASC`,
    args: [today],
  });

  const hoje = (agenda.rows as LinhaBD[]).filter((r) => r.date === today);
  const atrasados = (agenda.rows as LinhaBD[]).filter((r) => r.date < today);

  // Negócios em aberto sem próximo passo agendado
  const semProximo: LinhaBD[] = [];
  for (const c of s.clients) {
    const open = s.openVal.get(c.id) || 0;
    if (open > 0 && !s.nextEv.get(c.id)) {
      semProximo.push({
        id: c.id,
        name: c.name,
        value: open,
        days: daysSince(s.lastAct.get(c.id) || null),
      });
    }
  }
  semProximo.sort((a, b) => b.value - a.value);

  // A arrefecer: contactado mas há mais de 30 dias
  const arrefecer = s.clients
    .map((c) => ({ c, d: daysSince(s.lastAct.get(c.id) || null) }))
    .filter((x) => x.d != null && x.d > 30 && x.c.status !== 'Inativo')
    .sort((a, b) => (b.d || 0) - (a.d || 0))
    .slice(0, 10)
    .map(({ c, d }) => ({ id: c.id, name: c.name, days: d, status: c.status }));

  res.json({
    date: today,
    hoje: hoje.map((r) => ({
      id: r.id,
      title: r.title,
      time: r.time,
      type: r.type,
      clientName: r.client_name,
    })),
    atrasados: atrasados.map((r) => ({
      id: r.id,
      title: r.title,
      date: r.date,
      type: r.type,
      clientName: r.client_name,
    })),
    semProximoPasso: semProximo.slice(0, 10),
    arrefecer,
  });
});

/* ══════════════ FORECAST PONDERADO ══════════════ */
insightsRouter.get('/insights/forecast', async (_req, res) => {
  const r = await db.execute(`
    SELECT d.*, c.name AS client_name FROM deals d
    JOIN clients c ON c.id = d.client_id
    WHERE d.stage NOT IN ('Ganho','Perdido','Onboarding','Em serviço','Renovação')
  `);

  const months = new Map<
    string,
    { month: string; weighted: number; gross: number; count: number }
  >();
  let weighted = 0,
    gross = 0;

  for (const d of r.rows as LinhaBD[]) {
    const month = (d.due_date || '').slice(0, 7) || 'Sem data';
    const w = (d.value || 0) * ((d.probability || 0) / 100);
    weighted += w;
    gross += d.value || 0;
    const m = months.get(month) || { month, weighted: 0, gross: 0, count: 0 };
    m.weighted += w;
    m.gross += d.value || 0;
    m.count++;
    months.set(month, m);
  }

  const mrr = await db.execute(
    `SELECT COALESCE(SUM(recurring_value),0) AS v FROM deals
     WHERE stage IN ('Ganho','Onboarding','Em serviço','Renovação')`,
  );

  res.json({
    weighted: Math.round(weighted),
    gross,
    mrr: (mrr.rows[0] as LinhaBD).v || 0,
    byMonth: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
  });
});

/* ══════════════ DUPLICADOS ══════════════ */
insightsRouter.get('/insights/duplicates', async (_req, res) => {
  const r = await db.execute('SELECT id,name,nif,email,phone,city FROM clients');
  const rows = r.rows as LinhaBD[];
  const groups: { reason: string; key: string; clients: LinhaBD[] }[] = [];

  const byKey = (fn: (c: LinhaBD) => string | null, reason: string) => {
    const map = new Map<string, LinhaBD[]>();
    for (const c of rows) {
      const k = fn(c);
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    for (const [key, list] of map) {
      if (list.length > 1) groups.push({ reason, key, clients: list });
    }
  };

  byKey((c) => (c.nif || '').replace(/\D/g, '') || null, 'NIF igual');
  byKey((c) => (c.email || '').toLowerCase().trim() || null, 'Email igual');
  // Nome normalizado: sem acentos, sem forma jurídica, sem pontuação
  byKey((c) => {
    const n = (c.name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\b(lda|ldª|sa|s\.a|unipessoal|e\.m|em|sociedade)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
    return n.length > 4 ? n : null;
  }, 'Nome semelhante');

  res.json({ groups });
});

/* ══════════════ AÇÕES EM MASSA ══════════════ */
// Altera muitos registos de uma vez: um pedido pode marcar a carteira inteira
// como inativa. Fica reservado a administradores.
insightsRouter.post(
  '/clients/bulk',
  requireRole('admin'),
  validate(bulkSchema),
  async (req, res) => {
    const { ids, patch } = req.body as { ids: string[]; patch: LinhaBD };
    if (!Array.isArray(ids) || !ids.length)
      return res.status(400).json({ error: 'ids obrigatório' });

    const allowed: Record<string, string> = {
      status: 'status',
      salespersonId: 'salesperson_id',
      callState: 'call_state',
      starred: 'starred',
    };
    const sets: string[] = [];
    const vals: (string | number | null)[] = [];
    for (const [k, col] of Object.entries(allowed)) {
      if (patch[k] !== undefined) {
        sets.push(`${col}=?`);
        vals.push(k === 'starred' ? (patch[k] ? 1 : 0) : patch[k]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'nada para atualizar' });

    const placeholders = ids.map(() => '?').join(',');
    await db.execute({
      sql: `UPDATE clients SET ${sets.join(',')}, updated_at=datetime('now') WHERE id IN (${placeholders})`,
      args: [...vals, ...ids],
    });
    res.json({ ok: true, updated: ids.length });
  },
);

/* ══════════════ IMPORT CSV ══════════════ */
// Escreve em massa na base a partir de ficheiro externo — mesmo raciocínio.
insightsRouter.post(
  '/clients/import',
  requireRole('admin'),
  validate(importSchema),
  async (req, res) => {
    const { rows } = req.body as { rows: Record<string, string>[] };
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows obrigatório' });

    const existing = await db.execute('SELECT nif, name FROM clients');
    const nifs = new Set(
      (existing.rows as LinhaBD[]).map((r) => (r.nif || '').replace(/\D/g, '')).filter(Boolean),
    );
    const names = new Set(
      (existing.rows as LinhaBD[]).map((r) => (r.name || '').toLowerCase().trim()),
    );

    const { randomUUID } = await import('crypto');
    let inserted = 0,
      skipped = 0;
    const errors: string[] = [];
    const porInserir: InStatement[] = [];

    for (const [i, row] of rows.entries()) {
      const name = (row.name || row.nome || '').trim();
      if (!name) {
        errors.push(`Linha ${i + 2}: sem nome`);
        continue;
      }
      const nif = (row.nif || '').replace(/\D/g, '');
      if ((nif && nifs.has(nif)) || names.has(name.toLowerCase())) {
        skipped++;
        continue;
      }

      // Acumula em vez de escrever já: a importação inteira entra numa só
      // transação. Linha a linha, uma falha a meio deixava metade do ficheiro
      // importado e a outra metade não — e sem forma de saber onde parou.
      porInserir.push({
        sql: `INSERT INTO clients (id,name,nif,sector,status,contact,score,email,phone,city,notes)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          randomUUID(),
          name,
          nif || null,
          row.sector || row.setor || null,
          row.status || 'Prospeto',
          row.contact || row.contacto || null,
          Number(row.score) || 50,
          row.email || null,
          row.phone || row.telefone || null,
          row.city || row.localidade || null,
          row.notes || row.notas || null,
        ],
      });
      if (nif) nifs.add(nif);
      names.add(name.toLowerCase());
      inserted++;
    }

    if (porInserir.length) await db.batch(porInserir, 'write');

    res.json({ ok: true, inserted, skipped, errors });
  },
);

/* ══════════════ HISTÓRICO DE ALTERAÇÕES ══════════════ */
insightsRouter.get('/clients/:id/audit', async (req, res) => {
  const r = await db.execute({
    sql: 'SELECT * FROM audit_log WHERE entity=? AND entity_id=? ORDER BY at DESC LIMIT 50',
    args: ['client', String(req.params.id)],
  });
  res.json(
    (r.rows as LinhaBD[]).map((x) => ({
      id: x.id,
      field: x.field,
      oldValue: x.old_value,
      newValue: x.new_value,
      at: x.at,
    })),
  );
});

/* ══════════════ RESUMO POR CLIENTE (mata o N+1) ══════════════
   O frontend fazia `clients.map(c => api.activities.listByClient(c.id))` —
   20 clientes eram 20 pedidos HTTP só para desenhar a lista, e com 500
   clientes a aplicação deixava de responder. Aqui é uma query por tabela,
   agregada em memória. */
/**
 * Métricas por cliente, agregadas pela base de dados.
 *
 * Antes carregava clientes, atividades, negócios, agenda e interlocutores
 * inteiros para memória e cruzava tudo com `Map` em JavaScript. Funcionava com
 * 20 clientes; com dezenas de milhares de atividades, alguns pedidos em
 * paralelo bastavam para encher o heap do Node e bloquear o processo — e este
 * endpoint é chamado sempre que a lista de clientes é desenhada.
 *
 * Agora cada agregação é um `GROUP BY` e o servidor só recebe uma linha por
 * cliente. O SQLite faz isto com os índices que já existem em `client_id`.
 */
insightsRouter.get('/clients/summary', async (_req, res) => {
  const hoje = new Date().toISOString().slice(0, 10);
  const daqui30 = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);

  const GANHOS = "('Ganho','Onboarding','Em serviço','Renovação')";

  const r = await db.execute({
    sql: `
      SELECT
        c.id AS clientId,
        act.ultima            AS lastActivity,
        COALESCE(act.total, 0) AS activityCount,
        COALESCE(itl.total, 0) AS interlocutorCount,
        COALESCE(dl.aberto, 0) AS openValue,
        COALESCE(dl.abertos, 0) AS openDeals,
        COALESCE(dl.ganho, 0)  AS wonValue,
        ag.proxData            AS nextEventDate,
        ag.proxTipo            AS nextEventType,
        COALESCE(ag.followups, 0) AS pendingFollowups,
        COALESCE(ag.reuniao30, 0) AS hasUpcomingMeeting
      FROM clients c

      LEFT JOIN (
        SELECT client_id, MAX(date) AS ultima, COUNT(*) AS total
        FROM activities GROUP BY client_id
      ) act ON act.client_id = c.id

      LEFT JOIN (
        SELECT client_id, COUNT(*) AS total
        FROM interlocutors GROUP BY client_id
      ) itl ON itl.client_id = c.id

      LEFT JOIN (
        SELECT client_id,
          SUM(CASE WHEN stage IN ${GANHOS} THEN value ELSE 0 END) AS ganho,
          SUM(CASE WHEN stage NOT IN ${GANHOS} AND stage <> 'Perdido' THEN value ELSE 0 END) AS aberto,
          SUM(CASE WHEN stage NOT IN ${GANHOS} AND stage <> 'Perdido' THEN 1 ELSE 0 END) AS abertos
        FROM deals GROUP BY client_id
      ) dl ON dl.client_id = c.id

      LEFT JOIN (
        SELECT client_id,
          MIN(CASE WHEN date >= ?1 THEN date END) AS proxData,
          -- O tipo do evento mais próximo: a data mínima serve de chave.
          MIN(CASE WHEN date >= ?1 AND date = (
                SELECT MIN(date) FROM agenda a2
                WHERE a2.client_id = agenda.client_id AND a2.done = 0 AND a2.date >= ?1
              ) THEN type END) AS proxTipo,
          SUM(CASE WHEN type = 'Follow-up' THEN 1 ELSE 0 END) AS followups,
          MAX(CASE WHEN type IN ('Reunião','Demo') AND date >= ?1 AND date <= ?2
                   THEN 1 ELSE 0 END) AS reuniao30
        FROM agenda
        WHERE done = 0 AND client_id IS NOT NULL
        GROUP BY client_id
      ) ag ON ag.client_id = c.id
    `,
    args: [hoje, daqui30],
  });

  res.json(
    (r.rows as LinhaBD[]).map((x) => ({
      clientId: x.clientId,
      lastActivity: x.lastActivity ?? null,
      daysSinceContact: x.lastActivity ? daysSince(x.lastActivity) : null,
      activityCount: Number(x.activityCount),
      interlocutorCount: Number(x.interlocutorCount),
      openValue: Number(x.openValue),
      openDeals: Number(x.openDeals),
      wonValue: Number(x.wonValue),
      nextEvent: x.nextEventDate ? { date: x.nextEventDate, type: x.nextEventType } : null,
      hasUpcomingMeeting: Number(x.hasUpcomingMeeting) === 1,
      pendingFollowups: Number(x.pendingFollowups),
    })),
  );
});
