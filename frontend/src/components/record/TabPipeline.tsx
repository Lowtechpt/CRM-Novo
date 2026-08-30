import { useState } from 'react';
import type { Client, Deal, DealStage } from '../../types';
import { ALL_STAGES } from '../../types';
import { api } from '../../api';
import { eur } from './shared';

export function TabPipeline({
  client,
  deals,
  onChange,
}: {
  client: Client;
  deals: Deal[];
  onChange: (d: Deal[]) => void;
}) {
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [stage, setStage] = useState<DealStage>('Prospeto');
  const [recurring, setRecurring] = useState('');

  async function add() {
    if (!title.trim()) return;
    const created = await api.deals.create({
      clientId: client.id,
      title,
      value: Number(value) || 0,
      stage,
      recurringValue: Number(recurring) || 0,
    });
    onChange([created, ...deals]);
    setTitle('');
    setValue('');
    setRecurring('');
  }
  async function move(d: Deal, s: DealStage) {
    const u = await api.deals.update(d.id, { ...d, stage: s });
    onChange(deals.map((x) => (x.id === u.id ? u : x)));
  }
  async function del(id: string) {
    await api.deals.remove(id);
    onChange(deals.filter((d) => d.id !== id));
  }

  return (
    <>
      <div className="crm-form-section-title">Novo negócio</div>
      <div className="crm-form-row">
        <div className="crm-field">
          <label htmlFor="tabpipeline-titulo">Título</label>
          <input id="tabpipeline-titulo" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="crm-field">
          <label htmlFor="tabpipeline-valor">Valor (€)</label>
          <input
            id="tabpipeline-valor"
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="crm-field">
          <label htmlFor="tabpipeline-recorrente-mes">Recorrente / mês</label>
          <input
            id="tabpipeline-recorrente-mes"
            type="number"
            value={recurring}
            onChange={(e) => setRecurring(e.target.value)}
          />
        </div>
      </div>
      <div className="crm-form-row dual" style={{ marginBottom: 12 }}>
        <div className="crm-field">
          <label htmlFor="tabpipeline-estagio">Estágio</label>
          <select
            id="tabpipeline-estagio"
            value={stage}
            onChange={(e) => setStage(e.target.value as DealStage)}
          >
            {ALL_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button className="crm-submit" disabled={!title.trim()} onClick={add}>
        Adicionar negócio
      </button>

      <div style={{ marginTop: 24 }}>
        {deals.length === 0 && <div className="crm-empty">Sem negócios para este cliente.</div>}
        {deals.map((d) => (
          <div
            key={d.id}
            className="crm-card"
            style={{ display: 'flex', gap: 12, alignItems: 'center' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="crm-card-name">{d.title}</div>
              <div className="crm-deal-val" style={{ margin: '4px 0 0' }}>
                {eur(d.value)}
                {(d.recurringValue || 0) > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--c-muted)' }}>
                    {' '}
                    + {eur(d.recurringValue!)}/mês
                  </span>
                )}
              </div>
            </div>
            <select
              value={d.stage}
              onChange={(e) => move(d, e.target.value as DealStage)}
              style={{
                fontSize: 12,
                padding: '6px 8px',
                border: '.5px solid var(--c-line)',
                borderRadius: 8,
              }}
            >
              {ALL_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button className="crm-icon-btn danger" onClick={() => del(d.id)}>
              🗑
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
