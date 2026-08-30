import { useEffect, useMemo, useState } from 'react';
import type { Client, Competition, CompStatus, Salesperson } from '../types';
import { COMP_STATUSES } from '../types';
import { api } from '../api';
import { hoje } from '../datas';

function statusTone(s?: string) {
  const map: Record<string, string> = {
    Instalado: 'tone-instalado',
    'Em disputa': 'tone-disputa',
    Perdido: 'tone-perdido',
    Ganho: 'tone-ganho',
  };
  return map[s || ''] || 'tone-disputa';
}

function gapOf(k: Competition): number | null {
  if (k.competitorValue == null || k.ourValue == null) return null;
  return k.ourValue - k.competitorValue;
}

const fmt = (n: number) => n.toLocaleString('pt-PT', { maximumFractionDigits: 0 });
const clamp = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);

export default function ConcorrenciaPage({ clients }: { clients: Client[] }) {
  const [items, setItems] = useState<Competition[]>([]);
  const [people, setPeople] = useState<Salesperson[]>([]);
  const [filter, setFilter] = useState({ competitor: '', status: '', q: '' });
  const [editing, setEditing] = useState<Competition | null | undefined>(undefined);

  useEffect(() => {
    load();
    api.salespeople.list().then(setPeople).catch(console.error);
  }, []);
  function load() {
    api.competition.list().then(setItems).catch(console.error);
  }

  const competitors = useMemo(
    () =>
      Array.from(new Set(items.map((i) => i.competitor).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'pt'),
      ),
    [items],
  );

  const installed = items.filter((x) => x.status === 'Instalado').length;
  const disputed = items.filter((x) => x.status === 'Em disputa').length;
  const lost = items.filter((x) => x.status === 'Perdido').length;
  const avgGap = (() => {
    const gaps = items.map(gapOf).filter((v): v is number => v != null);
    if (!gaps.length) return '–';
    return fmt(Math.round(gaps.reduce((s, v) => s + v, 0) / gaps.length));
  })();

  const topCompetitors = useMemo(
    () =>
      competitors
        .map((name) => ({ name, count: items.filter((x) => x.competitor === name).length }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    [competitors, items],
  );

  const shown = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    return items
      .filter((k) => !filter.competitor || k.competitor === filter.competitor)
      .filter((k) => !filter.status || k.status === filter.status)
      .filter(
        (k) =>
          !q ||
          [k.clientName, k.competitor, k.competitorProduct, k.ourProduct, k.notes]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(q)),
      )
      .sort((a, b) => (a.clientName || '').localeCompare(b.clientName || '', 'pt'));
  }, [items, filter]);

  async function remove(id: string) {
    if (!confirm('Eliminar este registo?')) return;
    await api.competition.remove(id);
    load();
  }

  return (
    <div className="crm-page">
      <div className="crm-team-shell">
        <div className="crm-team-head">
          <div>
            <div className="crm-dash-title">Concorrência</div>
            <div className="crm-dash-note">Onde estão, com que produtos e onde perdemos.</div>
          </div>
          <div className="crm-kpi-box">
            <div className="crm-kpi-val">{installed}</div>
            <div className="crm-kpi-lbl">Já instalados</div>
          </div>
          <div className="crm-kpi-box">
            <div className="crm-kpi-val">{disputed}</div>
            <div className="crm-kpi-lbl">Em disputa</div>
          </div>
          <div className="crm-kpi-box">
            <div className="crm-kpi-val">{lost}</div>
            <div className="crm-kpi-lbl">Perdidos</div>
          </div>
          <div className="crm-kpi-box">
            <div className="crm-kpi-val">{avgGap}</div>
            <div className="crm-kpi-lbl">Gap médio</div>
          </div>
        </div>

        <div className="crm-dash-grid">
          <div className="crm-dash-card">
            <div className="crm-dash-title">Filtros</div>
            <div className="crm-form-row dual" style={{ marginBottom: 10 }}>
              <div className="crm-field">
                <label htmlFor="concorrenciapage-concorrente">Concorrente</label>
                <select
                  id="concorrenciapage-concorrente"
                  value={filter.competitor}
                  onChange={(e) => setFilter((f) => ({ ...f, competitor: e.target.value }))}
                >
                  <option value="">Todos</option>
                  {competitors.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="crm-field">
                <label htmlFor="concorrenciapage-estado">Estado</label>
                <select
                  id="concorrenciapage-estado"
                  value={filter.status}
                  onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="">Todos</option>
                  {COMP_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="crm-field">
              <label htmlFor="concorrenciapage-pesquisa">Pesquisa</label>
              <input
                id="concorrenciapage-pesquisa"
                value={filter.q}
                onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
                placeholder="Cliente, concorrente, produto..."
              />
            </div>
          </div>

          <div className="crm-dash-card">
            <div className="crm-dash-title">Top concorrentes</div>
            <div className="crm-dash-list">
              {topCompetitors.length === 0 && <div className="crm-dash-empty">Sem dados.</div>}
              {topCompetitors.map((t) => (
                <div key={t.name} className="crm-dash-row">
                  <span>{t.name}</span>
                  <strong>{t.count}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="crm-add-btn" onClick={() => setEditing(null)}>
            + Novo registo
          </button>
        </div>

        <div className="crm-team-table-wrap">
          <table className="crm-team-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Concorrente</th>
                <th>Produto deles</th>
                <th>Nosso produto</th>
                <th>Estado</th>
                <th>Deles</th>
                <th>Nós</th>
                <th>Diferença</th>
                <th>Responsável</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <div className="crm-dash-empty">Sem registos de concorrência.</div>
                  </td>
                </tr>
              )}
              {shown.map((k) => {
                const gap = gapOf(k);
                return (
                  <tr key={k.id}>
                    <td>
                      <div className="crm-team-namecell">
                        <strong>{k.clientName || '-'}</strong>
                        <span>{k.clientSector || ''}</span>
                      </div>
                    </td>
                    <td>
                      <span className="crm-team-num">{k.competitor || '-'}</span>
                    </td>
                    <td>{k.competitorProduct || '-'}</td>
                    <td>{k.ourProduct || '-'}</td>
                    <td>
                      <span className={`crm-status-pill ${statusTone(k.status)}`}>
                        {k.status || '-'}
                      </span>
                    </td>
                    <td>
                      <span className="crm-team-num">
                        {k.competitorValue != null ? fmt(k.competitorValue) : '-'}
                      </span>
                    </td>
                    <td>
                      <span className="crm-team-num">
                        {k.ourValue != null ? fmt(k.ourValue) : '-'}
                      </span>
                    </td>
                    <td>
                      <span className="crm-team-num">{gap == null ? '-' : fmt(gap)}</span>
                    </td>
                    <td>{k.salespersonName || '-'}</td>
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 8,
                          alignItems: 'center',
                        }}
                      >
                        <span>{clamp(k.notes || '-', 90)}</span>
                        <span style={{ display: 'flex', gap: 6 }}>
                          <button className="crm-team-drill-btn alt" onClick={() => setEditing(k)}>
                            Editar
                          </button>
                          <button className="crm-team-drill-btn alt" onClick={() => remove(k.id)}>
                            Eliminar
                          </button>
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== undefined && (
        <CompModal
          item={editing}
          clients={clients}
          people={people}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            load();
          }}
        />
      )}
    </div>
  );
}

function CompModal({
  item,
  clients,
  people,
  onClose,
  onSaved,
}: {
  item: Competition | null;
  clients: Client[];
  people: Salesperson[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<Partial<Competition>>(
    item ?? {
      clientId: '',
      competitor: '',
      competitorProduct: '',
      ourProduct: '',
      status: 'Em disputa',
      notes: '',
      date: hoje(),
    },
  );
  const [saving, setSaving] = useState(false);

  function set<K extends keyof Competition>(k: K, v: Competition[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    if (!f.competitor?.trim()) return;
    setSaving(true);
    try {
      if (item) await api.competition.update(item.id, f);
      else await api.competition.create(f);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="crm-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="crm-modal">
        <h3>{item ? 'Editar registo de concorrência' : 'Novo registo de concorrência'}</h3>

        <div className="crm-form-row dual">
          <div className="crm-field">
            <label htmlFor="concorrenciapage-cliente">Cliente</label>
            <select
              id="concorrenciapage-cliente"
              value={f.clientId || ''}
              onChange={(e) => set('clientId', e.target.value)}
            >
              <option value="">— sem cliente —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="crm-field">
            <label htmlFor="concorrenciapage-concorrente-2">Concorrente *</label>
            <input
              id="concorrenciapage-concorrente-2"
              value={f.competitor || ''}
              onChange={(e) => set('competitor', e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="crm-form-row dual">
          <div className="crm-field">
            <label htmlFor="concorrenciapage-produto-deles">Produto deles</label>
            <input
              id="concorrenciapage-produto-deles"
              value={f.competitorProduct || ''}
              onChange={(e) => set('competitorProduct', e.target.value)}
            />
          </div>
          <div className="crm-field">
            <label htmlFor="concorrenciapage-nosso-produto">Nosso produto</label>
            <input
              id="concorrenciapage-nosso-produto"
              value={f.ourProduct || ''}
              onChange={(e) => set('ourProduct', e.target.value)}
            />
          </div>
        </div>

        <div className="crm-form-row">
          <div className="crm-field">
            <label htmlFor="concorrenciapage-valor-deles">Valor deles (€)</label>
            <input
              id="concorrenciapage-valor-deles"
              type="number"
              value={f.competitorValue ?? ''}
              onChange={(e) =>
                set('competitorValue', e.target.value === '' ? undefined : Number(e.target.value))
              }
            />
          </div>
          <div className="crm-field">
            <label htmlFor="concorrenciapage-nosso-valor">Nosso valor (€)</label>
            <input
              id="concorrenciapage-nosso-valor"
              type="number"
              value={f.ourValue ?? ''}
              onChange={(e) =>
                set('ourValue', e.target.value === '' ? undefined : Number(e.target.value))
              }
            />
          </div>
          <div className="crm-field">
            <label htmlFor="concorrenciapage-estado-2">Estado</label>
            <select
              id="concorrenciapage-estado-2"
              value={f.status || 'Em disputa'}
              onChange={(e) => set('status', e.target.value as CompStatus)}
            >
              {COMP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="crm-form-row dual">
          <div className="crm-field">
            <label htmlFor="concorrenciapage-responsavel">Responsável</label>
            <select
              id="concorrenciapage-responsavel"
              value={f.salespersonId || ''}
              onChange={(e) => set('salespersonId', e.target.value)}
            >
              <option value="">— nenhum —</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="crm-field">
            <label htmlFor="concorrenciapage-data">Data</label>
            <input
              id="concorrenciapage-data"
              type="date"
              value={f.date || ''}
              onChange={(e) => set('date', e.target.value)}
            />
          </div>
        </div>

        <div className="crm-form-row single">
          <div className="crm-field">
            <label htmlFor="concorrenciapage-notas">Notas</label>
            <textarea
              id="concorrenciapage-notas"
              value={f.notes || ''}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
        </div>

        <div className="crm-modal-footer">
          <button className="crm-btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button className="crm-submit" disabled={saving || !f.competitor?.trim()} onClick={save}>
            {saving ? 'A guardar...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
