import { useEffect, useMemo, useState } from 'react';
import type { Client, Salesperson, Activity, Deal, AgendaEvent } from '../types';
import { api } from '../api';
import {
  VistaCanais,
  VistaConversao,
  VistaTempos,
  VistaPersistencia,
  VistaQualidade,
} from '../components/team/VistasAnalise';
import {
  type DadosEquipa,
  timingStats,
  persistenceStats,
  qualityStats,
  isWon,
  isOpen,
} from '../components/team/estatisticas';

type TeamView =
  | 'overview'
  | 'channels'
  | 'conversion'
  | 'timing'
  | 'persistence'
  | 'quality'
  | 'sectors'
  | 'ranking'
  | 'alerts'
  | 'coaching';

const TEAM_TABS: [TeamView, string][] = [
  ['overview', 'Resumo'],
  ['channels', 'Canais'],
  ['conversion', 'Conversão'],
  ['timing', 'Tempos'],
  ['persistence', 'Persistência'],
  ['quality', 'Qualidade'],
  ['sectors', 'Setores'],
  ['ranking', 'Ranking'],
  ['alerts', 'Alertas'],
  ['coaching', 'Coaching'],
];

const fmt = (n: number) => n.toLocaleString('pt-PT', { maximumFractionDigits: 0 });

interface Metrics {
  id: string;
  name: string;
  role?: string;
  clients: number;
  activities: number;
  openDeals: number;
  openValue: number;
  wonValue: number;
  wonDeals: number;
  successRate: number;
  pendingFollowups: number;
}

/** Teto de atividades trazidas para calcular as métricas desta página. */
const LIMITE_ATIVIDADES = 2000;

export default function EquipaPage({ clients }: { clients: Client[] }) {
  const [people, setPeople] = useState<Salesperson[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [agenda, setAgenda] = useState<AgendaEvent[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [view, setView] = useState<TeamView>('overview');
  const [adding, setAdding] = useState(false);
  const [atividadesTruncadas, setAtividadesTruncadas] = useState(false);

  /**
   * Recarrega quando a carteira muda de conteúdo, não só de tamanho.
   *
   * A dependência era `clients.length`: mudar o comercial responsável de um
   * cliente, o seu estado ou o seu valor não altera o comprimento do array, e
   * este ecrã continuava a mostrar as métricas antigas até alguém criar ou
   * apagar um cliente. Num painel de desempenho, mostrar números velhos sem
   * avisar é pior do que não os mostrar.
   *
   * A chave junta id e `updatedAt` de cada cliente: muda em qualquer edição,
   * e evita refazer os pedidos a cada render (que `[clients]` provocaria, por
   * a referência do array ser nova de cada vez).
   */
  const revisaoCarteira = useMemo(
    () =>
      clients
        .map((c) => `${c.id}:${c.updatedAt}`)
        .sort()
        .join('|'),
    [clients],
  );

  useEffect(() => {
    loadAll();
  }, [revisaoCarteira]);

  async function loadAll() {
    const [p, d, a] = await Promise.all([
      api.salespeople.list(),
      api.deals.list(),
      api.agenda.list(),
    ]);
    setPeople(p);
    setDeals(d);
    setAgenda(a);
    // Uma chamada em vez de uma por cliente.
    // O limite é alto de propósito: os rankings desta página contam atividades,
    // e um corte silencioso distorceria os números sem que ninguém percebesse.
    // Quando `total` chegar ao limite, a página avisa em vez de mentir.
    const recentes = await api.activities.recent(LIMITE_ATIVIDADES);
    setActivities(recentes);
    setAtividadesTruncadas(recentes.length >= LIMITE_ATIVIDADES);
  }

  const metrics = useMemo<Metrics[]>(
    () =>
      people.map((p) => {
        const own = clients.filter((c) => c.salespersonId === p.id);
        const ownIds = new Set(own.map((c) => c.id));
        const acts = activities.filter((a) => ownIds.has(a.clientId));
        const myDeals = deals.filter((d) => ownIds.has(d.clientId));
        const won = myDeals.filter(isWon);
        const open = myDeals.filter(isOpen);
        return {
          id: p.id,
          name: p.name,
          role: p.role,
          clients: own.length,
          activities: acts.length,
          openDeals: open.length,
          openValue: open.reduce((s, d) => s + d.value, 0),
          wonDeals: won.length,
          wonValue: won.reduce((s, d) => s + d.value, 0),
          successRate: myDeals.length ? Math.round((won.length / myDeals.length) * 100) : 0,
          pendingFollowups: agenda.filter(
            (e) => e.type === 'Follow-up' && !e.done && e.clientId && ownIds.has(e.clientId),
          ).length,
        };
      }),
    [people, clients, activities, deals, agenda],
  );

  const totals = metrics.reduce(
    (acc, m) => ({
      clients: acc.clients + m.clients,
      activities: acc.activities + m.activities,
      openValue: acc.openValue + m.openValue,
      wonValue: acc.wonValue + m.wonValue,
    }),
    { clients: 0, activities: 0, openValue: 0, wonValue: 0 },
  );

  const unassigned = clients.filter((c) => !c.salespersonId).length;

  // Os cálculos vivem em components/team/estatisticas.ts (funções puras).
  const dados: DadosEquipa = { clients, activities, deals, agenda, people };

  return (
    <div className="crm-page">
      <div className="crm-team-shell">
        <div className="crm-team-head">
          <div>
            <div className="crm-dash-title">Equipa</div>
            <div className="crm-dash-note">
              Desempenho por comercial e distribuição da carteira.
            </div>
            {/* Um corte silencioso distorceria os rankings sem ninguém dar por
                isso. Mais vale dizer que os números estão incompletos. */}
            {atividadesTruncadas && (
              <div className="crm-dash-note warn">
                Atenção: os cálculos usam apenas as {fmt(LIMITE_ATIVIDADES)} atividades mais
                recentes. Períodos mais antigos não estão incluídos.
              </div>
            )}
          </div>
          <div className="crm-kpi-box">
            <div className="crm-kpi-val">{people.length}</div>
            <div className="crm-kpi-lbl">Comerciais</div>
          </div>
          <div className="crm-kpi-box">
            <div className="crm-kpi-val">{totals.clients}</div>
            <div className="crm-kpi-lbl">Clientes atribuídos</div>
          </div>
          <div className="crm-kpi-box">
            <div className="crm-kpi-val">{fmt(totals.openValue)}</div>
            <div className="crm-kpi-lbl">Pipeline aberto (€)</div>
          </div>
          <div className="crm-kpi-box">
            <div className="crm-kpi-val">{fmt(totals.wonValue)}</div>
            <div className="crm-kpi-lbl">Receita fechada (€)</div>
          </div>
        </div>

        {/* MENU HORIZONTAL */}
        <div
          className="crm-detail-tabs"
          style={{
            background: '#fff',
            border: '.5px solid var(--c-line)',
            borderRadius: 10,
            padding: '0 10px',
          }}
        >
          {TEAM_TABS.map(([id, label]) => (
            <button
              key={id}
              className={`crm-detail-tab ${view === id ? 'active' : ''}`}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'overview' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="crm-add-btn" onClick={() => setAdding(true)}>
                + Comercial
              </button>
            </div>
            <div className="crm-team-table-wrap">
              <table className="crm-team-table">
                <thead>
                  <tr>
                    <th>Comercial</th>
                    <th>Clientes</th>
                    <th>Atividades</th>
                    <th>Negócios abertos</th>
                    <th>Pipeline (€)</th>
                    <th>Fechados</th>
                    <th>Receita (€)</th>
                    <th>Taxa</th>
                    <th>Follow-ups</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.length === 0 && (
                    <tr>
                      <td colSpan={10}>
                        <div className="crm-dash-empty">Sem comerciais registados.</div>
                      </td>
                    </tr>
                  )}
                  {metrics.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div className="crm-team-namecell">
                          <strong>{m.name}</strong>
                          <span>{m.role || ''}</span>
                        </div>
                      </td>
                      <td>
                        <span className="crm-team-num">{m.clients}</span>
                      </td>
                      <td>
                        <span className="crm-team-num">{m.activities}</span>
                      </td>
                      <td>
                        <span className="crm-team-num">{m.openDeals}</span>
                      </td>
                      <td>
                        <span className="crm-team-num">{fmt(m.openValue)}</span>
                      </td>
                      <td>
                        <span className="crm-team-num">{m.wonDeals}</span>
                      </td>
                      <td>
                        <span className="crm-team-num">{fmt(m.wonValue)}</span>
                      </td>
                      <td>
                        <span className="crm-team-num">{m.successRate}%</span>
                      </td>
                      <td>
                        <span className="crm-team-num">{m.pendingFollowups}</span>
                      </td>
                      <td>
                        <button
                          className="crm-team-drill-btn alt"
                          onClick={async () => {
                            if (!confirm(`Remover ${m.name}?`)) return;
                            await api.salespeople.remove(m.id);
                            loadAll();
                          }}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {view === 'channels' && <VistaCanais dados={dados} people={people} />}
        {view === 'conversion' && <VistaConversao dados={dados} people={people} />}
        {view === 'timing' && <VistaTempos dados={dados} people={people} />}
        {view === 'persistence' && <VistaPersistencia dados={dados} people={people} />}
        {view === 'quality' && <VistaQualidade dados={dados} people={people} />}
        {view === 'ranking' && (
          <div className="crm-dash-grid">
            <div className="crm-dash-card">
              <div className="crm-dash-title">Ranking por receita fechada</div>
              <div className="crm-dash-list">
                {metrics.length === 0 && <div className="crm-dash-empty">Sem dados.</div>}
                {[...metrics]
                  .sort((a, b) => b.wonValue - a.wonValue)
                  .map((m, i) => (
                    <div key={m.id} className="crm-dash-row">
                      <span>
                        {i + 1}º {m.name}
                        <div className="crm-team-mini">{m.wonDeals} negócios fechados</div>
                      </span>
                      <strong>€{fmt(m.wonValue)}</strong>
                    </div>
                  ))}
              </div>
            </div>
            <div className="crm-dash-card">
              <div className="crm-dash-title">Ranking por taxa de conversão</div>
              <div className="crm-dash-list">
                {metrics.length === 0 && <div className="crm-dash-empty">Sem dados.</div>}
                {[...metrics]
                  .sort((a, b) => b.successRate - a.successRate)
                  .map((m) => (
                    <div key={m.id} className="crm-dash-row">
                      <span>{m.name}</span>
                      <strong>{m.successRate}%</strong>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {view === 'alerts' && (
          <div className="crm-dash-grid">
            <div className="crm-dash-card">
              <div className="crm-dash-title">Alertas de carteira</div>
              <div className="crm-dash-list">
                <div className="crm-dash-row">
                  <span>Clientes sem comercial atribuído</span>
                  <strong>{unassigned}</strong>
                </div>
                <div className="crm-dash-row">
                  <span>Follow-ups pendentes</span>
                  <strong>{agenda.filter((e) => e.type === 'Follow-up' && !e.done).length}</strong>
                </div>
                <div className="crm-dash-row">
                  <span>Clientes marcados "Não atendeu"</span>
                  <strong>{clients.filter((c) => c.callState === 'no-answer').length}</strong>
                </div>
                <div className="crm-dash-row">
                  <span>Clientes em férias</span>
                  <strong>{clients.filter((c) => c.callState === 'vacation').length}</strong>
                </div>
              </div>
            </div>
            <div className="crm-dash-card">
              <div className="crm-dash-title">Comerciais sem carteira</div>
              <div className="crm-dash-list">
                {metrics.filter((m) => m.clients === 0).length === 0 ? (
                  <div className="crm-dash-empty">Todos têm clientes atribuídos.</div>
                ) : (
                  metrics
                    .filter((m) => m.clients === 0)
                    .map((m) => (
                      <div key={m.id} className="crm-dash-row">
                        <span>{m.name}</span>
                        <strong>0</strong>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {view === 'sectors' && (
          <div className="crm-dash-card">
            <div className="crm-dash-title">Distribuição por setor</div>
            <div className="crm-dash-list">
              {(() => {
                const bySector = new Map<string, number>();
                clients.forEach((c) => {
                  const k = c.sector || 'Sem setor';
                  bySector.set(k, (bySector.get(k) || 0) + 1);
                });
                const rows = [...bySector.entries()].sort((a, b) => b[1] - a[1]);
                if (!rows.length) return <div className="crm-dash-empty">Sem dados.</div>;
                return rows.map(([sector, n]) => (
                  <div key={sector} className="crm-dash-row">
                    <span>{sector}</span>
                    <strong>{n}</strong>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {view === 'coaching' &&
          (() => {
            const notes: { name: string; text: string; tone: 'good' | 'warn' }[] = [];
            for (const m of metrics) {
              if (m.clients === 0) continue;
              const s = persistenceStats(dados, new Set([m.id]));
              const q = qualityStats(dados, new Set([m.id]));
              const t = timingStats(dados, new Set([m.id]));

              if (m.successRate >= 50) {
                notes.push({
                  name: m.name,
                  tone: 'good',
                  text: `Taxa de conversão de ${m.successRate}% — acima da média. Vale a pena mapear o que está a fazer bem.`,
                });
              } else if (m.openDeals > 0 && m.successRate < 20) {
                notes.push({
                  name: m.name,
                  tone: 'warn',
                  text: `Taxa de conversão de ${m.successRate}% com ${m.openDeals} negócios em aberto. Rever abordagem de qualificação.`,
                });
              }

              if (s.single > s.threePlus && s.single >= 2) {
                notes.push({
                  name: m.name,
                  tone: 'warn',
                  text: `${s.single} clientes com apenas 1 toque registado. Follow-up insuficiente arrisca perder oportunidades por abandono, não por recusa.`,
                });
              }

              if (q.total > 0 && q.completePct < 50) {
                notes.push({
                  name: m.name,
                  tone: 'warn',
                  text: `Só ${q.completePct}% das fichas de cliente estão completas. Dados em falta dificultam handover e reporting.`,
                });
              }

              if (m.pendingFollowups >= 3) {
                notes.push({
                  name: m.name,
                  tone: 'warn',
                  text: `${m.pendingFollowups} follow-ups pendentes. Risco de clientes ficarem sem resposta.`,
                });
              }

              if (t.avgFirstTouch !== '—') {
                const days = parseInt(t.avgFirstTouch);
                if (days > 7) {
                  notes.push({
                    name: m.name,
                    tone: 'warn',
                    text: `Primeiro contacto em média ${t.avgFirstTouch} após o cliente entrar no CRM. Reduzir este tempo tende a melhorar a conversão.`,
                  });
                }
              }
            }
            return (
              <div className="crm-dash-card">
                <div className="crm-dash-title">Recomendações de coaching</div>
                <div className="crm-dash-note" style={{ marginBottom: 14 }}>
                  Gerado a partir de conversão, persistência, qualidade de dados e tempos de
                  resposta de cada comercial.
                </div>
                {notes.length === 0 && (
                  <div className="crm-dash-empty">
                    Sem sinais suficientes para gerar recomendações — regista mais atividades.
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {notes.map((n, i) => (
                    <div
                      key={i}
                      className="crm-card"
                      style={{
                        borderLeft: `3px solid ${n.tone === 'good' ? 'var(--c-line)' : 'var(--c-danger)'}`,
                      }}
                    >
                      <div className="crm-card-name">{n.name}</div>
                      <div className="crm-card-role" style={{ marginTop: 4 }}>
                        {n.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
      </div>

      {adding && (
        <PersonModal
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            loadAll();
          }}
        />
      )}
    </div>
  );
}

function PersonModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: '', role: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!f.name.trim()) return;
    setSaving(true);
    try {
      await api.salespeople.create(f);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="crm-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="crm-modal">
        <h3>Novo Comercial</h3>
        <div className="crm-form-row dual">
          <div className="crm-field">
            <label htmlFor="equipapage-nome">Nome *</label>
            <input
              id="equipapage-nome"
              value={f.name}
              onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="crm-field">
            <label htmlFor="equipapage-funcao">Função</label>
            <input
              id="equipapage-funcao"
              value={f.role}
              onChange={(e) => setF((p) => ({ ...p, role: e.target.value }))}
            />
          </div>
        </div>
        <div className="crm-form-row dual">
          <div className="crm-field">
            <label htmlFor="equipapage-email">Email</label>
            <input
              id="equipapage-email"
              value={f.email}
              onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))}
            />
          </div>
          <div className="crm-field">
            <label htmlFor="equipapage-telefone">Telefone</label>
            <input
              id="equipapage-telefone"
              value={f.phone}
              onChange={(e) => setF((p) => ({ ...p, phone: e.target.value }))}
            />
          </div>
        </div>
        <div className="crm-modal-footer">
          <button className="crm-btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button className="crm-submit" disabled={saving || !f.name.trim()} onClick={save}>
            {saving ? 'A guardar...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
