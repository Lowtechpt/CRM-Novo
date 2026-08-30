import { useState } from 'react';
import type { Client, AgendaEvent } from '../../types';
import { api } from '../../api';
import { hoje } from '../../datas';

export function TabAgenda({
  client,
  events,
  onChange,
  kind,
}: {
  client: Client;
  events: AgendaEvent[];
  onChange: (e: AgendaEvent[]) => void;
  kind: 'agenda' | 'followup';
}) {
  const isF = kind === 'followup';
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => hoje());
  const [time, setTime] = useState('09:00');
  const shown = events.filter((e) => (isF ? e.type === 'Follow-up' : e.type !== 'Follow-up'));

  async function add() {
    if (!title.trim()) return;
    const created = await api.agenda.create({
      clientId: client.id,
      type: isF ? 'Follow-up' : 'Reunião',
      title,
      date,
      time,
    });
    onChange([...events, created]);
    setTitle('');
  }
  async function toggle(ev: AgendaEvent) {
    const u = await api.agenda.update(ev.id, { ...ev, done: !ev.done });
    onChange(events.map((e) => (e.id === u.id ? u : e)));
  }
  async function del(id: string) {
    await api.agenda.remove(id);
    onChange(events.filter((e) => e.id !== id));
  }

  return (
    <>
      <div className="crm-form-section-title">{isF ? 'Novo follow-up' : 'Agendar evento'}</div>
      <div className="crm-form-row">
        <div className="crm-field">
          <label htmlFor="tabagenda-titulo">Título</label>
          <input id="tabagenda-titulo" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="crm-field">
          <label htmlFor="tabagenda-data">Data</label>
          <input
            id="tabagenda-data"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="crm-field">
          <label htmlFor="tabagenda-hora">Hora</label>
          <input
            id="tabagenda-hora"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>
      <button className="crm-submit" disabled={!title.trim()} onClick={add}>
        {isF ? 'Adicionar follow-up' : 'Agendar'}
      </button>
      <div style={{ marginTop: 24 }}>
        {shown.length === 0 && <div className="crm-empty">Nada agendado.</div>}
        {shown.map((e) => (
          <div
            key={e.id}
            className="crm-card"
            style={{ display: 'flex', gap: 12, alignItems: 'center' }}
          >
            <input type="checkbox" checked={e.done} onChange={() => toggle(e)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="crm-card-name"
                style={{ textDecoration: e.done ? 'line-through' : 'none' }}
              >
                {e.title}
              </div>
              <div className="crm-card-role">
                {e.date} · {e.time} · {e.type}
              </div>
            </div>
            <button className="crm-icon-btn danger" onClick={() => del(e.id)}>
              🗑
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
