import type { Client, Salesperson } from '../types';

/**
 * Secondary Nav / View Bar — padrão HubSpot
 * (INVESTIGACAO/layout.md §2: "vistas personalizadas guardadas como abas
 * estilo Excel" + filtros rápidos por proprietário).
 */

export type ViewId = 'todos' | 'meus' | 'estrela' | 'ativos' | 'prospetos' | 'frios';

export interface ViewDef {
  id: ViewId;
  label: string;
  match: (c: Client, ctx: { ownerId?: string; daysSince: Map<string, number | null> }) => boolean;
}

export const VIEWS: ViewDef[] = [
  { id: 'todos', label: 'Todos', match: () => true },
  { id: 'meus', label: 'Meus', match: (c, x) => !!x.ownerId && c.salespersonId === x.ownerId },
  { id: 'estrela', label: 'A seguir', match: (c) => !!c.starred },
  { id: 'ativos', label: 'Ativos', match: (c) => c.status === 'Ativo' },
  { id: 'prospetos', label: 'Prospetos', match: (c) => c.status === 'Prospeto' },
  {
    id: 'frios',
    label: 'Sem contacto 30d',
    match: (c, x) => {
      const d = x.daysSince.get(c.id);
      return d == null || d > 30;
    },
  },
];

interface Props {
  view: ViewId;
  onView: (v: ViewId) => void;
  counts: Record<ViewId, number>;
  people: Salesperson[];
  ownerFilter: string;
  onOwnerFilter: (id: string) => void;
  layout: 'lista' | 'tabela';
  onLayout: (l: 'lista' | 'tabela') => void;
  total: number;
}

export default function ViewBar({
  view,
  onView,
  counts,
  people,
  ownerFilter,
  onOwnerFilter,
  layout,
  onLayout,
  total,
}: Props) {
  return (
    <div className="crm-viewbar">
      <div className="crm-viewbar-tabs">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={`crm-viewtab ${view === v.id ? 'active' : ''}`}
            onClick={() => onView(v.id)}
          >
            {v.label}
            <span className="crm-viewtab-count">{counts[v.id] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="crm-viewbar-tools">
        <span className="crm-viewbar-total">{total} registos</span>

        <select
          className="crm-viewbar-select"
          value={ownerFilter}
          aria-label="Filtrar por comercial"
          onChange={(e) => onOwnerFilter(e.target.value)}
        >
          <option value="">Todos os comerciais</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <div className="crm-seg">
          <button
            className={layout === 'lista' ? 'active' : ''}
            onClick={() => onLayout('lista')}
            title="Vista de lista"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
          </button>
          <button
            className={layout === 'tabela' ? 'active' : ''}
            onClick={() => onLayout('tabela')}
            title="Vista de tabela"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M3 15h18M9 3v18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
