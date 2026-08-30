import { useMemo } from 'react';
import type { Client, Salesperson } from '../types';

interface Props {
  clients: Client[];
  people: Salesperson[];
  daysSince: Map<string, number | null>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onToggleStar: (id: string) => void;
  query: string;
  onQuery: (q: string) => void;
}

function scoreClass(s: number) {
  if (s >= 70) return 'score-high';
  if (s >= 40) return 'score-mid';
  return 'score-low';
}

/**
 * Etiqueta do comercial responsável.
 *
 * Era uma paleta rotativa: roxo, rosa, azul, verde, atribuídos por hash do
 * nome. Com cinco comerciais numa lista, a coluna virava um mostruário de
 * cores sem significado nenhum — a cor não dizia nada sobre o cliente, só
 * sobre quem calhava ser o dono.
 *
 * Cor comunica prioridade. Gastá-la em identidade deixa a interface sem
 * vocabulário para o que é mesmo urgente.
 */
const SP_BADGE = { bg: 'var(--c-surface-3)', color: 'var(--c-muted)' };

const CALL_STATES: Record<string, { label: string; bg: string; color: string }> = {
  'no-answer': { label: 'Não atendeu', bg: 'var(--c-danger-soft)', color: 'var(--c-danger)' },
  vacation: { label: 'Férias', bg: 'var(--c-surface-3)', color: 'var(--c-muted)' },
};

export default function ClientList({
  clients,
  people,
  daysSince,
  selectedId,
  onSelect,
  onNew,
  onToggleStar,
  query,
  onQuery,
}: Props) {
  const spName = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);

  return (
    <div className="crm-client-list">
      <div className="crm-search">
        {/* `aria-label` porque o campo não tem etiqueta visível — o placeholder
            desaparece ao escrever e não é lido de forma fiável. */}
        <input
          type="text"
          placeholder="Pesquisar nesta vista…"
          value={query}
          aria-label="Pesquisar clientes nesta vista"
          onChange={(e) => onQuery(e.target.value)}
        />
        <button className="crm-add-btn" onClick={onNew} aria-label="Novo cliente">
          + Novo
        </button>
      </div>

      <div className="crm-list-items" role="list" aria-label="Clientes">
        {clients.length === 0 && <div className="crm-empty">Sem clientes nesta vista.</div>}
        {clients.map((c) => {
          const owner = c.salespersonId ? spName.get(c.salespersonId) : null;
          const call = c.callState ? CALL_STATES[c.callState] : null;
          const d = daysSince.get(c.id);
          return (
            /* `role` e teclado: era um `div` com `onClick`, que não recebe
               foco nem responde a Enter. Quem navega por teclado não conseguia
               escolher um cliente. Não pode ser um `<button>` porque tem outro
               botão dentro (a estrela). */
            <div
              key={c.id}
              className={`crm-list-item ${selectedId === c.id ? 'selected' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`Abrir ${c.name}`}
              aria-current={selectedId === c.id ? 'true' : undefined}
              onClick={() => onSelect(c.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(c.id);
                }
              }}
            >
              <button
                className={`crm-item-star ${c.starred ? 'active' : ''}`}
                title={c.starred ? 'Retirar estrela' : 'Seguir de perto'}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStar(c.id);
                }}
              >
                {c.starred ? '★' : '☆'}
              </button>

              <div className="crm-item-info">
                <div className="crm-item-name">{c.name}</div>
                <div className="crm-item-sub">
                  {c.sector || c.city || c.status || 'Sem classificação'}
                </div>

                {/* Badges em linha própria — .crm-item-name tem ellipsis e
                    cortaria conteúdo extra em nomes compridos. */}
                <div className="crm-item-badges">
                  {owner && (
                    <span
                      className="crm-badge-pill"
                      style={{ background: SP_BADGE.bg, color: SP_BADGE.color }}
                    >
                      {owner}
                    </span>
                  )}
                  {d == null ? (
                    <span
                      className="crm-badge-pill"
                      style={{ background: 'var(--c-danger-soft)', color: 'var(--c-danger)' }}
                      title="Nunca foi contactado"
                    >
                      ⚠ Sem contacto
                    </span>
                  ) : d > 60 ? (
                    <span
                      className="crm-badge-pill"
                      style={{ background: 'var(--c-danger-soft)', color: 'var(--c-danger)' }}
                      title={`Último contacto há ${d} dias`}
                    >
                      ⚠ {d}d
                    </span>
                  ) : d > 30 ? (
                    <span
                      className="crm-badge-pill"
                      style={{ background: 'var(--c-surface-3)', color: 'var(--c-muted)' }}
                      title={`Último contacto há ${d} dias`}
                    >
                      {d}d
                    </span>
                  ) : (
                    <span
                      className="crm-badge-pill"
                      style={{ background: 'var(--c-surface-3)', color: 'var(--c-muted)' }}
                    >
                      Contacto 30d
                    </span>
                  )}
                  {call && (
                    <span
                      className="crm-badge-pill"
                      style={{ background: call.bg, color: call.color }}
                    >
                      {call.label}
                    </span>
                  )}
                  {(c as Client & { _pending?: boolean })._pending && (
                    <span
                      className="crm-badge-pill"
                      style={{ background: 'var(--c-surface-3)', color: 'var(--c-muted)' }}
                    >
                      POR SINCRONIZAR
                    </span>
                  )}
                </div>
              </div>

              <span className={`crm-item-score ${scoreClass(c.score)}`}>{c.score}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
