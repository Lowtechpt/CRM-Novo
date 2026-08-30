import { useState } from 'react';
import type { Client, Deal, ClientStatus } from '../types';

/**
 * Business Process Flow — padrão Dynamics 365 / Salesforce Path
 * (INVESTIGACAO/layout.md §3, mudanca.md "Mudar 2").
 *
 * Clicar numa etapa avança o cliente para esse estado, sem abrir modal.
 */

const STEPS: { id: ClientStatus; label: string; need: string }[] = [
  { id: 'Prospeto', label: 'Prospeto', need: 'Registar o primeiro contacto' },
  { id: 'Contactado', label: 'Contactado', need: 'Identificar interlocutor e criar negócio' },
  { id: 'Ativo', label: 'Ativo', need: 'Negócio ganho e cliente em serviço' },
];

interface Props {
  client: Client;
  deals: Deal[];
  activityCount: number;
  interlocutorCount: number;
  onChangeStatus: (status: ClientStatus) => Promise<void>;
}

export default function ProcessFlow({
  client,
  deals,
  activityCount,
  interlocutorCount,
  onChangeStatus,
}: Props) {
  const [busy, setBusy] = useState<ClientStatus | null>(null);

  const currentIdx = Math.max(
    0,
    STEPS.findIndex((s) => s.id === client.status),
  );
  const isInactive = client.status === 'Inativo';

  // O que falta para avançar a partir da fase atual
  const blockers: string[] = [];
  if (activityCount === 0) blockers.push('Sem atividades registadas');
  if (interlocutorCount === 0) blockers.push('Sem interlocutor identificado');
  if (currentIdx >= 1 && deals.length === 0) blockers.push('Sem negócio criado');
  if (deals.length > 0 && deals.every((d) => !d.value)) blockers.push('Negócio sem valor definido');

  async function go(status: ClientStatus) {
    if (status === client.status) return;
    setBusy(status);
    try {
      await onChangeStatus(status);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="crm-flow">
      <div className="crm-flow-steps">
        {STEPS.map((step, i) => {
          const state = isInactive
            ? 'todo'
            : i < currentIdx
              ? 'done'
              : i === currentIdx
                ? 'current'
                : 'todo';
          return (
            <button
              key={step.id}
              className={`crm-flow-step ${state}`}
              title={i === currentIdx ? step.need : `Marcar como ${step.label}`}
              onClick={() => go(step.id)}
              disabled={busy !== null}
            >
              <span className="crm-flow-dot">
                {busy === step.id ? '…' : i < currentIdx && !isInactive ? '✓' : i + 1}
              </span>
              <span className="crm-flow-label">{step.label}</span>
            </button>
          );
        })}
        <button
          className={`crm-flow-step ${isInactive ? 'lost' : 'todo'}`}
          title="Marcar como Inativo"
          onClick={() => go('Inativo')}
          disabled={busy !== null}
        >
          <span className="crm-flow-dot">{busy === 'Inativo' ? '…' : '×'}</span>
          <span className="crm-flow-label">Inativo</span>
        </button>
      </div>

      {blockers.length > 0 && !isInactive && (
        <div className="crm-flow-blockers">
          <strong>Para avançar:</strong> {blockers.join(' · ')}
        </div>
      )}
    </div>
  );
}
