import { useEffect, useState } from 'react';
import type {
  Client,
  Deal,
  AgendaEvent,
  Interlocutor,
  ClientStatus,
  Activity,
  Competition,
} from '../types';
import { api } from '../api';
import ProcessFlow from './ProcessFlow';
import { eur, daysBetween, STATUS_CLASS } from './record/shared';
import { PropsColumn } from './record/PropsColumn';
import { Timeline } from './record/Timeline';
import { RelatedColumn } from './record/RelatedColumn';
import { TabPipeline } from './record/TabPipeline';
import { TabAgenda } from './record/TabAgenda';
import { TabNotas, TabNoticias, TabChatIa } from './record/TabsSimples';
import { ScorePopover } from './record/ScorePopover';

/**
 * Página de registo do cliente.
 *
 * Estrutura de 3 colunas dentro do registo — o padrão que a investigação
 * identifica como standard da indústria (INVESTIGACAO/layout.md §1 e §2:
 * "HubSpot popularizou o layout de 3 colunas fixas"):
 *
 *   Propriedades  |  Timeline de atividade  |  Associações e contexto
 *
 * As tabs continuam para o que não cabe nesta vista (Pipeline, Agenda,
 * Follow-up, Notas, Notícias, Chat IA).
 */

type Tab =
  'atividade' | 'info' | 'pipeline' | 'agenda' | 'followup' | 'notas' | 'noticias' | 'chatia';

const TABS: { id: Tab; label: string }[] = [
  { id: 'atividade', label: 'Atividade' },
  { id: 'info', label: 'Informações' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'followup', label: 'Follow-up' },
  { id: 'notas', label: 'Notas' },
  { id: 'noticias', label: 'Notícias' },
  { id: 'chatia', label: 'Chat IA' },
];

interface Props {
  client: Client | null;
  allClients: Client[];
  interlocutors: Interlocutor[];
  onEdit: () => void;
  onPatch: (patch: Partial<Client>) => Promise<void>;
  onAddInterlocutor: (d: Partial<Interlocutor>) => Promise<void>;
  onRemoveInterlocutor: (id: string) => Promise<void>;
  /** Só em ecrã estreito: fecha a ficha e volta à lista. */
  onVoltar?: () => void;
}

export default function ClientRecord({
  client,
  allClients,
  interlocutors,
  onEdit,
  onPatch,
  onAddInterlocutor,
  onRemoveInterlocutor,
  onVoltar,
}: Props) {
  const [tab, setTab] = useState<Tab>('atividade');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [agenda, setAgenda] = useState<AgendaEvent[]>([]);
  const [competition, setCompetition] = useState<Competition[]>([]);

  // Uma carga por cliente; as tabs leem deste estado (sem piscar ao trocar)
  useEffect(() => {
    if (!client) {
      setDeals([]);
      setActivities([]);
      setAgenda([]);
      setCompetition([]);
      return;
    }
    const id = client.id;
    api.deals.listByClient(id).then(setDeals).catch(console.error);
    api.activities.listByClient(id).then(setActivities).catch(console.error);
    api.agenda.listByClient(id).then(setAgenda).catch(console.error);
    api.competition.listByClient(id).then(setCompetition).catch(console.error);
  }, [client?.id]);

  if (!client) {
    return (
      <div className="crm-detail">
        <div className="crm-detail-empty">Seleciona um cliente</div>
      </div>
    );
  }

  const lastActivity = activities.length
    ? [...activities].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))[0]
    : null;
  const nextEvent =
    [...agenda]
      .filter((e) => !e.done && new Date(e.date) >= new Date(new Date().toDateString()))
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0] || null;
  const openValue = deals
    .filter((d) => !['Ganho', 'Perdido'].includes(d.stage))
    .reduce((s, d) => s + d.value, 0);
  const daysSince = lastActivity ? daysBetween(lastActivity.date) : null;

  return (
    <div className="crm-detail">
      <div className="crm-detail-header">
        {onVoltar && (
          <button className="crm-voltar" onClick={onVoltar} aria-label="Voltar à lista">
            ←
          </button>
        )}
        <div className="crm-detail-title">
          <div className="crm-detail-name">{client.name}</div>
          <div className="crm-detail-contacts">
            {client.email && (
              <a className="crm-contact-link" href={`mailto:${client.email}`}>
                {client.email}
              </a>
            )}
            {client.email && client.phone && <span>{'  ·  '}</span>}
            {client.phone && (
              <a className="crm-contact-link" href={`tel:${client.phone.replace(/\s/g, '')}`}>
                {client.phone}
              </a>
            )}
            {(client.email || client.phone) && client.website && <span>{'  ·  '}</span>}
            {client.website && (
              <a
                className="crm-contact-link"
                target="_blank"
                rel="noreferrer"
                href={
                  client.website.startsWith('http') ? client.website : `https://${client.website}`
                }
              >
                {client.website}
              </a>
            )}
            {!client.email && !client.phone && !client.website && '—'}
          </div>
        </div>
        <span className={`crm-detail-status ${STATUS_CLASS[client.status] || ''}`}>
          {client.status}
        </span>
        <button className="crm-btn-outline" onClick={onEdit}>
          Editar tudo
        </button>
      </div>

      <div className="crm-highlights">
        <div className="crm-hl-item">
          <div className="crm-hl-lbl">Pipeline aberto</div>
          <div className={`crm-hl-val ${openValue ? '' : 'muted'}`}>
            {openValue ? eur(openValue) : '—'}
          </div>
        </div>
        <div className="crm-hl-item">
          <div className="crm-hl-lbl">Último contacto</div>
          <div
            className={`crm-hl-val ${daysSince == null ? 'muted' : daysSince > 30 ? 'warn' : ''}`}
          >
            {daysSince == null ? 'Nunca' : daysSince === 0 ? 'Hoje' : `há ${daysSince} d`}
          </div>
        </div>
        <div className="crm-hl-item">
          <div className="crm-hl-lbl">Próxima ação</div>
          <div className={`crm-hl-val ${nextEvent ? '' : 'warn'}`}>
            {nextEvent
              ? `${nextEvent.date.slice(5).replace('-', '/')} · ${nextEvent.type}`
              : 'Nada agendado'}
          </div>
        </div>
        <div className="crm-hl-item">
          <div className="crm-hl-lbl">Negócios</div>
          <div className="crm-hl-val">{deals.length}</div>
        </div>
        <div className="crm-hl-item">
          <div className="crm-hl-lbl">Score</div>
          <ScorePopover clientId={client.id} score={client.score} />
        </div>
      </div>

      <ProcessFlow
        client={client}
        deals={deals}
        activityCount={activities.length}
        interlocutorCount={interlocutors.length}
        onChangeStatus={(status: ClientStatus) => onPatch({ status })}
      />

      <div className="crm-detail-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`crm-detail-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Cada tab tem a largura toda para si.
          As Associações ficam numa coluna fixa à direita, porque são contexto
          permanente (padrão dos 5: coluna de related lists). */}
      <div className="crm-record">
        <div className="crm-record-col main">
          {tab === 'atividade' && (
            <Timeline
              client={client}
              interlocutors={interlocutors}
              activities={activities}
              onChange={setActivities}
            />
          )}
          {tab === 'info' && (
            <PropsColumn client={client} allClients={allClients} onPatch={onPatch} />
          )}
          {tab === 'pipeline' && <TabPipeline client={client} deals={deals} onChange={setDeals} />}
          {tab === 'agenda' && (
            <TabAgenda client={client} events={agenda} onChange={setAgenda} kind="agenda" />
          )}
          {tab === 'followup' && (
            <TabAgenda client={client} events={agenda} onChange={setAgenda} kind="followup" />
          )}
          {tab === 'notas' && <TabNotas client={client} onPatch={onPatch} />}
          {tab === 'noticias' && <TabNoticias client={client} />}
          {tab === 'chatia' && <TabChatIa client={client} />}
        </div>

        <div className="crm-record-col rel">
          <div className="crm-record-coltitle">Associações</div>
          <RelatedColumn
            client={client}
            deals={deals}
            competition={competition}
            interlocutors={interlocutors}
            onAdd={onAddInterlocutor}
            onRemove={onRemoveInterlocutor}
          />
        </div>
      </div>
    </div>
  );
}

/* ══════════ COLUNA 1 — propriedades com edição inline ══════════ */
