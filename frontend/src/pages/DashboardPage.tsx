import { useEffect, useState } from 'react';
import type { Client, Deal, AgendaEvent, Activity, ActivityType } from '../types';
import { ACT_TYPES } from '../types';
import { api } from '../api';
import { paraIso } from '../datas';

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const STATUSES = ['Prospeto', 'Contactado', 'Ativo', 'Inativo'] as const;

const toneOf = (status: string) =>
  status === 'Ativo'
    ? 'green'
    : status === 'Inativo'
      ? 'red'
      : status === 'Contactado'
        ? 'amber'
        : '';

/** Barras horizontais com largura proporcional ao maior valor (mín. 8%). */
function BarRows({ rows }: { rows: { label: string; value: number; tone?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="crm-dash-bars">
      {rows.map((row) => (
        <div key={row.label} className="crm-dash-bar-row">
          <div className="crm-dash-bar-lbl">{row.label}</div>
          <div className="crm-dash-bar-track">
            <div
              className={`crm-dash-bar-fill ${row.tone || ''}`}
              style={{ width: `${Math.max(8, Math.round((row.value / max) * 100))}%` }}
            />
          </div>
          <div className="crm-dash-bar-val">{row.value}</div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage({ clients }: { clients: Client[] }) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [agenda, setAgenda] = useState<AgendaEvent[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    api.deals.list().then(setDeals).catch(console.error);
    api.agenda.list().then(setAgenda).catch(console.error);
    if (!clients.length) return;
    // Uma chamada em vez de uma por cliente
    api.activities.recent(400).then(setActivities).catch(console.error);
  }, [clients.length]);

  const contactedIds = new Set(activities.map((a) => a.clientId).filter(Boolean));
  const pendingFollowups = agenda.filter((a) => a.type === 'Follow-up' && !a.done).length;
  const agendaEvents = agenda.filter((a) => a.type !== 'Follow-up' && !a.done).length;
  const starred = clients.filter((c) => c.starred).length;

  const statusCounts = STATUSES.map((status) => ({
    label: status,
    value: clients.filter((c) => (c.status || 'Prospeto') === status).length,
    tone: toneOf(status),
  }));

  const activityCounts = ACT_TYPES.reduce(
    (acc, type) => {
      acc[type] = activities.filter((a) => a.type === type).length;
      return acc;
    },
    {} as Record<ActivityType, number>,
  );

  // Últimos 7 dias, do mais antigo para hoje
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const recentDays = Array.from({ length: 7 }, (_, idx) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - idx));
    const key = paraIso(day);
    return {
      label: DAY_LABELS[day.getDay()],
      value: activities.filter((a) => a.date === key).length,
    };
  });
  const maxRecent = Math.max(1, ...recentDays.map((x) => x.value));

  const upcoming = [...agenda]
    .filter((a) => !a.done)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .slice(0, 5);

  const withGps = clients.filter(
    (c) => Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)),
  ).length;
  const avgScore = clients.length
    ? Math.round(clients.reduce((s, c) => s + (Number(c.score) || 0), 0) / clients.length)
    : 0;
  const acts30d = activities.filter((a) => {
    const days = (Date.now() - new Date(a.date).getTime()) / 86400000;
    return days >= 0 && days < 30;
  }).length;

  return (
    <div className="crm-page">
      <div className="crm-team-shell">
        <div className="crm-dash-hero">
          <div>
            <div className="crm-dash-title">Resumo comercial</div>
            <div className="crm-dash-total">{clients.length}</div>
            <div className="crm-dash-note">Clientes no filtro atual.</div>
          </div>
          <div className="crm-kpi-box">
            <div className="crm-kpi-val">{pendingFollowups}</div>
            <div className="crm-kpi-lbl">Follow-ups</div>
          </div>
          <div className="crm-kpi-box">
            <div className="crm-kpi-val" style={{ color: 'var(--c-accent)' }}>
              {agendaEvents}
            </div>
            <div className="crm-kpi-lbl">Agenda</div>
          </div>
          <div className="crm-kpi-box">
            <div className="crm-kpi-val" style={{ color: 'var(--c-muted)' }}>
              {starred}
            </div>
            <div className="crm-kpi-lbl">A seguir</div>
          </div>
        </div>

        <div className="crm-dash-grid">
          <div className="crm-dash-card">
            <div className="crm-dash-title">Operação</div>
            <div className="crm-dash-list">
              <div className="crm-dash-row">
                <span>Clientes registados</span>
                <strong>{clients.length}</strong>
              </div>
              <div className="crm-dash-row">
                <span>Clientes ativos</span>
                <strong>{clients.filter((c) => c.status === 'Ativo').length}</strong>
              </div>
              <div className="crm-dash-row">
                <span>Clientes contactados</span>
                <strong>{clients.filter((c) => contactedIds.has(c.id)).length}</strong>
              </div>
              <div className="crm-dash-row">
                <span>Follow-ups pendentes</span>
                <strong>{pendingFollowups}</strong>
              </div>
              <div className="crm-dash-row">
                <span>Eventos de agenda</span>
                <strong>{agendaEvents}</strong>
              </div>
            </div>
          </div>
          <div className="crm-dash-card">
            <div className="crm-dash-title">Atividade registada</div>
            <div className="crm-dash-chips">
              {ACT_TYPES.map((type) => (
                <div key={type} className="crm-dash-chip">
                  <b>{activityCounts[type] || 0}</b>
                  <span>{type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="crm-dash-chart-grid">
          <div className="crm-dash-card">
            <div className="crm-dash-title">Clientes por estado</div>
            <BarRows rows={statusCounts} />
          </div>

          <div className="crm-dash-card">
            <div className="crm-dash-title">Atividade últimos 7 dias</div>
            <div className="crm-dash-days">
              {recentDays.map((day, i) => (
                <div key={i} className="crm-dash-day">
                  <div className="crm-dash-day-val">{day.value}</div>
                  <div
                    className="crm-dash-day-bar"
                    style={{
                      height: `${Math.max(8, Math.round((day.value / maxRecent) * 120))}px`,
                    }}
                  />
                  <div className="crm-dash-day-lbl">{day.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="crm-dash-card">
            <div className="crm-dash-title">Próximos follow-ups</div>
            <div className="crm-dash-soon">
              {upcoming.length === 0 && (
                <div className="crm-dash-empty">Sem follow-ups pendentes.</div>
              )}
              {upcoming.map((ag) => (
                <div key={ag.id} className="crm-dash-soon-item">
                  <div className="crm-dash-soon-date">
                    {ag.date.slice(5).replace('-', '/')}
                    {ag.time && (
                      <>
                        <br />
                        {ag.time}
                      </>
                    )}
                  </div>
                  <div>
                    <div className="crm-dash-soon-main">{ag.clientName || '—'}</div>
                    <div className="crm-dash-soon-sub">
                      {ag.type || 'Evento'}
                      {ag.title ? ` — ${ag.title}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="crm-dash-card">
            <div className="crm-dash-title">Cobertura comercial</div>
            <div className="crm-dash-list">
              <div className="crm-dash-row">
                <span>Clientes com email</span>
                <strong>{clients.filter((c) => !!c.email).length}</strong>
              </div>
              <div className="crm-dash-row">
                <span>Clientes com telefone</span>
                <strong>{clients.filter((c) => !!c.phone).length}</strong>
              </div>
              <div className="crm-dash-row">
                <span>Atividades 30 dias</span>
                <strong>{acts30d}</strong>
              </div>
              <div className="crm-dash-row">
                <span>Clientes com GPS</span>
                <strong>{withGps}</strong>
              </div>
              <div className="crm-dash-row">
                <span>Score médio clientes</span>
                <strong>{avgScore}</strong>
              </div>
            </div>
          </div>

          <div className="crm-dash-card">
            <div className="crm-dash-title">Pipeline</div>
            <div className="crm-dash-list">
              <div className="crm-dash-row">
                <span>Negócios em aberto</span>
                <strong>
                  {
                    deals.filter(
                      (d) =>
                        !['Ganho', 'Perdido', 'Onboarding', 'Em serviço', 'Renovação'].includes(
                          d.stage,
                        ),
                    ).length
                  }
                </strong>
              </div>
              <div className="crm-dash-row">
                <span>Valor em aberto</span>
                <strong>
                  €
                  {deals
                    .filter(
                      (d) =>
                        !['Ganho', 'Perdido', 'Onboarding', 'Em serviço', 'Renovação'].includes(
                          d.stage,
                        ),
                    )
                    .reduce((s, d) => s + d.value, 0)
                    .toLocaleString('pt-PT')}
                </strong>
              </div>
              <div className="crm-dash-row">
                <span>Ganhos</span>
                <strong>{deals.filter((d) => d.stage === 'Ganho').length}</strong>
              </div>
              <div className="crm-dash-row">
                <span>Perdidos</span>
                <strong>{deals.filter((d) => d.stage === 'Perdido').length}</strong>
              </div>
              <div className="crm-dash-row">
                <span>MRR</span>
                <strong>
                  €{deals.reduce((s, d) => s + (d.recurringValue || 0), 0).toLocaleString('pt-PT')}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
