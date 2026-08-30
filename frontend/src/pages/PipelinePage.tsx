import { useEffect, useState } from 'react';
import type { Client, Deal, DealStage, AgendaEvent } from '../types';
import { ALL_STAGES, OPEN_STAGES } from '../types';
import { api } from '../api';

export default function PipelinePage({ clients }: { clients: Client[] }) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<DealStage | null>(null);
  const [editing, setEditing] = useState<Deal | null | undefined>(undefined);
  const [agenda, setAgenda] = useState<AgendaEvent[]>([]);

  useEffect(() => {
    load();
  }, []);
  function load() {
    api.deals.list().then(setDeals).catch(console.error);
    api.agenda.list().then(setAgenda).catch(console.error);
  }

  /** Clientes com pelo menos um evento futuro por fazer.
   *  Um negócio em aberto sem nada agendado fica sinalizado — padrão Pipedrive
   *  (bandeira vermelha), ver INVESTIGACAO/layout.md §5. */
  const scheduled = new Set(
    agenda
      .filter(
        (e) => !e.done && e.clientId && new Date(e.date) >= new Date(new Date().toDateString()),
      )
      .map((e) => e.clientId!),
  );

  /** Move o negócio para outra coluna. Atualiza já em memória para o cartão
   *  não "saltar" de volta enquanto o servidor responde. */
  async function moveTo(stage: DealStage) {
    const deal = deals.find((d) => d.id === dragId);
    setDragId(null);
    setDragOver(null);
    if (!deal || deal.stage === stage) return;
    setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, stage } : d)));
    try {
      await api.deals.update(deal.id, { ...deal, stage });
    } finally {
      load();
    }
  }

  return (
    <div className="crm-page">
      <div className="crm-page-head">
        <div>
          <h1>Pipeline</h1>
          <p>Arrasta os cartões entre colunas para mudar o estágio</p>
        </div>
        <button className="crm-add-btn" onClick={() => setEditing(null)}>
          + Negócio
        </button>
      </div>

      <div className="crm-kanban-board">
        {ALL_STAGES.map((stage) => {
          const list = deals.filter((d) => d.stage === stage);
          const total = list.reduce((s, d) => s + d.value, 0);
          return (
            <div key={stage} className="crm-kanban-col">
              <div className="crm-kanban-hdr">
                <span className="crm-kanban-stage">{stage}</span>
                <span className="crm-kanban-count">
                  {list.length}
                  {total ? ` · €${total.toLocaleString('pt-PT')}` : ''}
                </span>
              </div>
              <div
                className={`crm-kanban-cards ${dragOver === stage ? 'drag-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(stage);
                }}
                onDragLeave={() => setDragOver((s) => (s === stage ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  moveTo(stage);
                }}
              >
                {list.map((d) => (
                  <div
                    key={d.id}
                    className={`crm-deal-card ${dragId === d.id ? 'dragging' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      setDragId(d.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDragOver(null);
                    }}
                    onClick={() => setEditing(d)}
                  >
                    <div className="crm-deal-name">{d.title}</div>
                    <div className="crm-deal-client">{d.clientName}</div>
                    {d.value > 0 && (
                      <div className="crm-deal-val">€{d.value.toLocaleString('pt-PT')}</div>
                    )}
                    {d.probability > 0 && <div className="crm-deal-prob">{d.probability}%</div>}
                    {(d.recurringValue || 0) > 0 && (
                      <div className="crm-deal-prob">
                        €{d.recurringValue!.toLocaleString('pt-PT')}/mês
                      </div>
                    )}
                    {(OPEN_STAGES as string[]).includes(d.stage) && !scheduled.has(d.clientId) && (
                      <div className="crm-deal-flag">⚑ Sem próxima atividade</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {editing !== undefined && (
        <DealModal
          deal={editing}
          clients={clients}
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

function DealModal({
  deal,
  clients,
  onClose,
  onSaved,
}: {
  deal: Deal | null;
  clients: Client[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<Partial<Deal>>(
    deal ?? {
      clientId: '',
      title: '',
      value: 0,
      stage: 'Prospeto',
      probability: 20,
      recurringValue: 0,
    },
  );
  const [saving, setSaving] = useState(false);

  /* Escape fecha o painel. Sem isto ficava preso: o fundo cobre o ecrã todo,
     sidebar incluída, e o utilizador não tem como sair a não ser adivinhar que
     precisa de clicar fora. O modal do cliente e a barra de comando já fechavam
     assim — este ficou para trás. */
  useEffect(() => {
    const sair = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', sair);
    return () => window.removeEventListener('keydown', sair);
  }, [onClose]);

  function set<K extends keyof Deal>(k: K, v: Deal[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    if (!f.clientId || !f.title?.trim()) return;
    setSaving(true);
    try {
      if (deal) await api.deals.update(deal.id, f);
      else await api.deals.create(f);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deal || !confirm(`Eliminar "${deal.title}"?`)) return;
    await api.deals.remove(deal.id);
    onSaved();
  }

  return (
    <div className="crm-drawer-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="crm-drawer" role="dialog" aria-modal="true" aria-label="Detalhe do negócio">
        <div className="crm-drawer-head">
          <div className="crm-drawer-title">
            <div className="crm-drawer-name">{deal ? deal.title : 'Novo Negócio'}</div>
            {deal && (
              <div className="crm-drawer-sub">
                {deal.clientName} · {deal.stage}
              </div>
            )}
          </div>
          <button className="crm-drawer-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="crm-drawer-body">
          <div className="crm-form-row dual">
            <div className="crm-field">
              <label htmlFor="pipelinepage-cliente">Cliente *</label>
              <select
                id="pipelinepage-cliente"
                value={f.clientId || ''}
                onChange={(e) => set('clientId', e.target.value)}
              >
                <option value="">— escolher —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="crm-field">
              <label htmlFor="pipelinepage-titulo">Título *</label>
              <input
                id="pipelinepage-titulo"
                value={f.title || ''}
                onChange={(e) => set('title', e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div className="crm-form-row">
            <div className="crm-field">
              <label htmlFor="pipelinepage-valor">Valor (€)</label>
              <input
                id="pipelinepage-valor"
                type="number"
                value={f.value ?? 0}
                onChange={(e) => set('value', Number(e.target.value))}
              />
            </div>
            <div className="crm-field">
              <label htmlFor="pipelinepage-recorrente-mes">Recorrente / mês (€)</label>
              <input
                id="pipelinepage-recorrente-mes"
                type="number"
                value={f.recurringValue ?? 0}
                onChange={(e) => set('recurringValue', Number(e.target.value))}
              />
            </div>
            <div className="crm-field">
              <label htmlFor="pipelinepage-probabilidade">Probabilidade (%)</label>
              <input
                id="pipelinepage-probabilidade"
                type="number"
                min={0}
                max={100}
                value={f.probability ?? 20}
                onChange={(e) => set('probability', Number(e.target.value))}
              />
            </div>
          </div>

          <div className="crm-form-row dual">
            <div className="crm-field">
              <label htmlFor="pipelinepage-estagio">Estágio</label>
              <select
                id="pipelinepage-estagio"
                value={f.stage || 'Prospeto'}
                onChange={(e) => set('stage', e.target.value as DealStage)}
              >
                {ALL_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="crm-field">
              <label htmlFor="pipelinepage-data-prevista">Data prevista</label>
              <input
                id="pipelinepage-data-prevista"
                type="date"
                value={f.dueDate || ''}
                onChange={(e) => set('dueDate', e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="crm-drawer-foot">
          <button className="crm-btn-outline" onClick={onClose}>
            Cancelar
          </button>
          {deal && (
            <button className="crm-btn-outline danger" onClick={remove}>
              Eliminar
            </button>
          )}
          <button
            className="crm-submit"
            disabled={saving || !f.clientId || !f.title?.trim()}
            onClick={save}
          >
            {saving ? 'A guardar...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
