import { useMemo, useState } from 'react';
import type { Client, Activity, ActivityType, Interlocutor } from '../../types';
import { ACT_TYPES, ACT_ABBR } from '../../types';
import { api } from '../../api';
import VoiceInput from '../VoiceInput';
import { daysBetween } from './shared';
import { hoje } from '../../datas';

export function Timeline({
  client,
  interlocutors,
  activities,
  onChange,
}: {
  client: Client;
  interlocutors: Interlocutor[];
  activities: Activity[];
  onChange: (a: Activity[]) => void;
}) {
  const [type, setType] = useState<ActivityType>('Telefonema');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(() => hoje());
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [spokeTo, setSpokeTo] = useState('');
  const [saving, setSaving] = useState(false);
  // Colapsado por defeito, como o "Log activity" do HubSpot: só ocupa espaço
  // quando o utilizador vai mesmo registar alguma coisa.
  const [open, setOpen] = useState(false);

  async function add() {
    if (!notes.trim()) return;
    setSaving(true);
    try {
      const created = await api.activities.create(client.id, { type, date, time, notes, spokeTo });
      onChange([created, ...activities]);
      setNotes('');
      setSpokeTo('');
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    await api.activities.remove(id, client.id);
    onChange(activities.filter((a) => a.id !== id));
  }

  const groups = useMemo(() => {
    const sorted = [...activities].sort((a, b) =>
      `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`),
    );
    const map = new Map<string, Activity[]>();
    for (const a of sorted) {
      if (!map.has(a.date)) map.set(a.date, []);
      map.get(a.date)!.push(a);
    }
    return [...map.entries()].map(([d, items]) => {
      const n = daysBetween(d);
      const label =
        n === 0
          ? 'Hoje'
          : n === 1
            ? 'Ontem'
            : n > 1 && n < 7
              ? `Há ${n} dias`
              : new Date(d).toLocaleDateString('pt-PT', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                });
      return { date: d, label, items };
    });
  }, [activities]);

  return (
    <>
      {!open ? (
        <div className="crm-composer-collapsed">
          <button className="crm-composer-trigger" onClick={() => setOpen(true)}>
            <span className="crm-composer-trigger-ico">+</span>
            <span>Registar atividade…</span>
          </button>
          <button
            className="crm-voice-btn"
            onClick={() => setOpen(true)}
            title="Registar a falar (pt-PT)"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
            </svg>
            <span>Ditar</span>
          </button>
        </div>
      ) : (
        <div className="crm-composer">
          <div className="crm-composer-tabs">
            {ACT_TYPES.map((t) => (
              <button
                key={t}
                className={`crm-composer-tab ${type === t ? 'active' : ''}`}
                onClick={() => setType(t)}
              >
                {t}
              </button>
            ))}
            <button className="crm-composer-close" onClick={() => setOpen(false)} title="Fechar">
              ×
            </button>
          </div>
          <div className="crm-composer-body">
            <textarea
              className="crm-composer-input"
              value={notes}
              autoFocus
              onChange={(e) => setNotes(e.target.value)}
              placeholder={`Registar ${type.toLowerCase()}…  (Ctrl+Enter guarda)`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add();
              }}
            />
            <div className="crm-composer-foot">
              <input
                className="crm-composer-meta"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <input
                className="crm-composer-meta"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
              <select
                className="crm-composer-meta"
                value={spokeTo}
                onChange={(e) => setSpokeTo(e.target.value)}
              >
                <option value="">— ninguém em específico —</option>
                {interlocutors.map((i) => (
                  <option key={i.id} value={i.name}>
                    {i.name}
                  </option>
                ))}
              </select>
              <VoiceInput baseText={notes} onTranscript={setNotes} />
              <button
                className="crm-submit"
                style={{ marginLeft: 'auto' }}
                disabled={saving || !notes.trim()}
                onClick={add}
              >
                {saving ? 'A guardar…' : 'Registar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {groups.length === 0 && <div className="crm-empty">Ainda sem atividades registadas.</div>}
      {groups.map((g) => (
        <div key={g.date} className="crm-tl-group">
          <div className="crm-tl-day">{g.label}</div>
          <div className="crm-tl-items">
            {g.items.map((a) => {
              const sigla = ACT_ABBR[a.type] ?? '??';
              return (
                <div key={a.id} className="crm-tl-item">
                  <div className={`crm-tl-marker ${sigla.toLowerCase()}`}>{sigla}</div>
                  <div className="crm-tl-head">
                    <span>{a.type}</span>
                    <span className="crm-tl-time">{a.time}</span>
                  </div>
                  <div className="crm-tl-text">{a.notes}</div>
                  {a.spokeTo && <div className="crm-tl-meta">Falou com {a.spokeTo}</div>}
                  <button className="crm-tl-del" onClick={() => del(a.id)} title="Eliminar">
                    🗑
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

/* ══════════ COLUNA 3 — associações ══════════ */
