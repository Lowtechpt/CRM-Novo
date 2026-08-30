import { useEffect, useMemo, useState } from 'react';
import type { Client, AgendaEvent, AgendaType } from '../types';
import { AGENDA_TYPES } from '../types';
import { api } from '../api';
import { hoje } from '../datas';

type CalView = 'day' | 'week' | 'month';

/* ── Helpers de data (equivalentes aos do CRM de referência) ── */
const dateOnly = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const dateKey = (d: Date) => {
  const x = dateOnly(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const dateAdd = (d: Date, n: number) => {
  const x = dateOnly(d);
  x.setDate(x.getDate() + n);
  return x;
};
/** Semana começa à segunda-feira. */
const weekStart = (d: Date) => {
  const x = dateOnly(d);
  const day = (x.getDay() + 6) % 7;
  return dateAdd(x, -day);
};

interface Props {
  clients: Client[];
  kind: 'agenda' | 'followup';
}

export default function AgendaPage({ clients, kind }: Props) {
  const isFollowup = kind === 'followup';
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [view, setView] = useState<CalView>('week');
  const [cursor, setCursor] = useState(() => new Date());
  const [editing, setEditing] = useState<AgendaEvent | null | undefined>(undefined);

  useEffect(() => {
    load();
  }, []);
  function load() {
    api.agenda.list().then(setEvents).catch(console.error);
  }

  const items = useMemo(
    () => events.filter((e) => (isFollowup ? e.type === 'Follow-up' : e.type !== 'Follow-up')),
    [events, isFollowup],
  );

  const byDay = useMemo(() => {
    const map: Record<string, AgendaEvent[]> = {};
    for (const e of items) {
      (map[e.date] ||= []).push(e);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    }
    return map;
  }, [items]);

  function move(dir: number) {
    if (view === 'day') setCursor((c) => dateAdd(c, dir));
    else if (view === 'week') setCursor((c) => dateAdd(c, dir * 7));
    else
      setCursor((c) => {
        const x = dateOnly(c);
        x.setMonth(x.getMonth() + dir);
        return x;
      });
  }

  const periodLabel = (() => {
    const d = dateOnly(cursor);
    if (view === 'day')
      return d.toLocaleDateString('pt-PT', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    if (view === 'week') {
      const s = weekStart(d);
      const e = dateAdd(s, 6);
      return `${s.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })} – ${e.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    }
    return d.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  })();

  return (
    <div className="crm-page">
      <div className="crm-page-head">
        <div>
          <h1>{isFollowup ? 'Follow-up' : 'Agenda'}</h1>
          <p>
            {isFollowup
              ? 'Seguimentos pendentes e histórico de todos os clientes'
              : 'Reuniões, demos e eventos de todos os clientes'}
          </p>
        </div>
        <button className="crm-add-btn" onClick={() => setEditing(null)}>
          {isFollowup ? '+ Novo follow-up' : '+ Agendar evento'}
        </button>
      </div>

      <div className="crm-calendar-shell">
        <div className="crm-calendar-toolbar">
          <div className="crm-calendar-title">{periodLabel}</div>
          <div className="crm-calendar-actions">
            <button className="crm-cal-btn" onClick={() => move(-1)}>
              Anterior
            </button>
            <button className="crm-cal-btn" onClick={() => setCursor(new Date())}>
              Hoje
            </button>
            <button className="crm-cal-btn" onClick={() => move(1)}>
              Seguinte
            </button>
            <div className="crm-cal-seg">
              {(['day', 'week', 'month'] as CalView[]).map((v) => (
                <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
                  {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Mês'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {view === 'day' && <DayView cursor={cursor} byDay={byDay} onOpen={setEditing} />}
        {view === 'week' && <WeekView cursor={cursor} byDay={byDay} onOpen={setEditing} />}
        {view === 'month' && <MonthView cursor={cursor} byDay={byDay} onOpen={setEditing} />}
      </div>

      {editing !== undefined && (
        <EventModal
          event={editing}
          clients={clients}
          defaultType={isFollowup ? 'Follow-up' : 'Reunião'}
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

function EventCard({ ev, onOpen }: { ev: AgendaEvent; onOpen: (e: AgendaEvent) => void }) {
  return (
    <div
      className={`crm-cal-event ${ev.done ? 'done' : ''}`}
      onClick={() => onOpen(ev)}
      title="Editar evento"
    >
      <div className="crm-cal-event-time">
        {ev.time || 'Sem hora'} · {ev.type}
      </div>
      <div className="crm-cal-event-title">{ev.clientName || ev.title}</div>
      {ev.clientName && ev.title && <div className="crm-cal-event-note">{ev.title}</div>}
    </div>
  );
}

function DayView({
  cursor,
  byDay,
  onOpen,
}: {
  cursor: Date;
  byDay: Record<string, AgendaEvent[]>;
  onOpen: (e: AgendaEvent) => void;
}) {
  const d = dateOnly(cursor);
  const list = byDay[dateKey(d)] || [];
  return (
    <div className="crm-cal-day-view">
      <div className="crm-cal-day-card">
        <div className="crm-cal-day-num">{d.getDate()}</div>
        <div className="crm-cal-day-label">
          {d.toLocaleDateString('pt-PT', { weekday: 'long', month: 'long', year: 'numeric' })}
        </div>
      </div>
      <div className="crm-cal-day-events">
        {list.length === 0 ? (
          <div className="crm-cal-empty">Sem eventos neste dia</div>
        ) : (
          list.map((e) => <EventCard key={e.id} ev={e} onOpen={onOpen} />)
        )}
      </div>
    </div>
  );
}

function WeekView({
  cursor,
  byDay,
  onOpen,
}: {
  cursor: Date;
  byDay: Record<string, AgendaEvent[]>;
  onOpen: (e: AgendaEvent) => void;
}) {
  const start = weekStart(cursor);
  const today = dateKey(new Date());
  const days = Array.from({ length: 7 }, (_, i) => dateAdd(start, i));
  return (
    <div className="crm-cal-week">
      {days.map((d, i) => (
        <div key={`h${i}`} className="crm-cal-head">
          {d.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' })}
        </div>
      ))}
      {days.map((d, i) => {
        const key = dateKey(d);
        const evs = byDay[key] || [];
        return (
          <div key={`c${i}`} className={`crm-cal-cell ${key === today ? 'today' : ''}`}>
            <div className="crm-cal-date">
              {d.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit' })}
            </div>
            {evs.length === 0 ? (
              <div className="crm-cal-empty" style={{ padding: 4, fontSize: 11 }}>
                Sem eventos
              </div>
            ) : (
              evs.map((e) => <EventCard key={e.id} ev={e} onOpen={onOpen} />)
            )}
          </div>
        );
      })}
    </div>
  );
}

function MonthView({
  cursor,
  byDay,
  onOpen,
}: {
  cursor: Date;
  byDay: Record<string, AgendaEvent[]>;
  onOpen: (e: AgendaEvent) => void;
}) {
  const base = dateOnly(cursor);
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const start = weekStart(first);
  const today = dateKey(new Date());
  const heads = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const days = Array.from({ length: 42 }, (_, i) => dateAdd(start, i));
  return (
    <div className="crm-cal-month">
      {heads.map((h) => (
        <div key={h} className="crm-cal-head">
          {h}
        </div>
      ))}
      {days.map((d, i) => {
        const key = dateKey(d);
        const evs = byDay[key] || [];
        const outside = d.getMonth() !== base.getMonth();
        return (
          <div
            key={i}
            className={`crm-cal-cell ${outside ? 'outside' : ''} ${key === today ? 'today' : ''}`}
          >
            <div className={`crm-cal-date ${outside ? 'muted' : ''}`}>{d.getDate()}</div>
            {evs.slice(0, 4).map((e) => (
              <EventCard key={e.id} ev={e} onOpen={onOpen} />
            ))}
            {evs.length > 4 && (
              <div className="crm-cal-empty" style={{ padding: 2, fontSize: 11 }}>
                +{evs.length - 4} eventos
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EventModal({
  event,
  clients,
  defaultType,
  onClose,
  onSaved,
}: {
  event: AgendaEvent | null;
  clients: Client[];
  defaultType: AgendaType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<Partial<AgendaEvent>>(
    event ?? {
      clientId: '',
      type: defaultType,
      title: '',
      date: hoje(),
      time: '09:00',
      done: false,
    },
  );
  const [saving, setSaving] = useState(false);

  function set<K extends keyof AgendaEvent>(k: K, v: AgendaEvent[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    if (!f.title?.trim() || !f.date) return;
    setSaving(true);
    try {
      if (event) await api.agenda.update(event.id, f);
      else await api.agenda.create(f);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!event || !confirm('Eliminar este evento?')) return;
    await api.agenda.remove(event.id);
    onSaved();
  }

  return (
    <div className="crm-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="crm-modal">
        <h3>{event ? 'Editar Evento' : 'Novo Evento'}</h3>

        <div className="crm-form-row dual">
          <div className="crm-field">
            <label htmlFor="agendapage-cliente">Cliente</label>
            <select
              id="agendapage-cliente"
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
            <label htmlFor="agendapage-tipo">Tipo</label>
            <select
              id="agendapage-tipo"
              value={f.type || defaultType}
              onChange={(e) => set('type', e.target.value as AgendaType)}
            >
              {AGENDA_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="crm-form-row single">
          <div className="crm-field">
            <label htmlFor="agendapage-titulo">Título *</label>
            <input
              id="agendapage-titulo"
              value={f.title || ''}
              onChange={(e) => set('title', e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="crm-form-row">
          <div className="crm-field">
            <label htmlFor="agendapage-data">Data</label>
            <input
              id="agendapage-data"
              type="date"
              value={f.date || ''}
              onChange={(e) => set('date', e.target.value)}
            />
          </div>
          <div className="crm-field">
            <label htmlFor="agendapage-hora">Hora</label>
            <input
              id="agendapage-hora"
              type="time"
              value={f.time || ''}
              onChange={(e) => set('time', e.target.value)}
            />
          </div>
          <div className="crm-field">
            <label htmlFor="agendapage-estado">Estado</label>
            <select
              id="agendapage-estado"
              value={f.done ? '1' : '0'}
              onChange={(e) => set('done', e.target.value === '1')}
            >
              <option value="0">Por fazer</option>
              <option value="1">Concluído</option>
            </select>
          </div>
        </div>

        <div className="crm-modal-footer">
          <button className="crm-btn-outline" onClick={onClose}>
            Cancelar
          </button>
          {event && (
            <button className="crm-btn-outline danger" onClick={remove}>
              Eliminar
            </button>
          )}
          <button className="crm-submit" disabled={saving || !f.title?.trim()} onClick={save}>
            {saving ? 'A guardar...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
