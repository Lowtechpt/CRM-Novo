import { useMemo, useState } from 'react';
import type { Client, Salesperson } from '../types';

/**
 * Vista de tabela com colunas ordenáveis — a vista de lista densa que os 5
 * líderes oferecem a par do Kanban/cards (INVESTIGACAO/layout.md §1, §5).
 */

type SortKey = 'name' | 'status' | 'score' | 'sector' | 'city' | 'owner' | 'contact';

interface Props {
  clients: Client[];
  people: Salesperson[];
  daysSince: Map<string, number | null>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleStar: (id: string) => void;
}

export default function ClientTable({
  clients,
  people,
  daysSince,
  selectedId,
  onSelect,
  onToggleStar,
}: Props) {
  const [sort, setSort] = useState<SortKey>('name');
  const [dir, setDir] = useState<1 | -1>(1);

  const spName = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);

  function toggleSort(k: SortKey) {
    if (k === sort) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSort(k);
      setDir(1);
    }
  }

  const rows = useMemo(() => {
    const val = (c: Client): string | number => {
      switch (sort) {
        case 'score':
          return c.score;
        case 'status':
          return c.status;
        case 'sector':
          return c.sector || '';
        case 'city':
          return c.city || '';
        case 'owner':
          return (c.salespersonId && spName.get(c.salespersonId)) || '';
        case 'contact':
          return daysSince.get(c.id) ?? 9999;
        default:
          return c.name;
      }
    };
    return [...clients].sort((a, b) => {
      const x = val(a),
        y = val(b);
      const r =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'pt');
      return r * dir;
    });
  }, [clients, sort, dir, spName, daysSince]);

  const COLS: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Cliente' },
    { key: 'status', label: 'Estado' },
    { key: 'score', label: 'Score' },
    { key: 'sector', label: 'Setor' },
    { key: 'city', label: 'Localidade' },
    { key: 'owner', label: 'Comercial' },
    { key: 'contact', label: 'Último contacto' },
  ];

  return (
    <div className="crm-table-wrap">
      <table className="crm-table">
        <thead>
          <tr>
            <th style={{ width: 34 }} />
            {COLS.map((c) => (
              <th
                key={c.key}
                className={sort === c.key ? 'sorted' : ''}
                onClick={() => toggleSort(c.key)}
              >
                {c.label}
                <span className="sort">{sort === c.key ? (dir === 1 ? '▲' : '▼') : '▲'}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={8}>
                <div className="crm-empty">Sem clientes nesta vista.</div>
              </td>
            </tr>
          )}
          {rows.map((c) => {
            const d = daysSince.get(c.id);
            return (
              <tr
                key={c.id}
                className={selectedId === c.id ? 'selected' : ''}
                onClick={() => onSelect(c.id)}
              >
                <td
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStar(c.id);
                  }}
                >
                  <span
                    className={`crm-item-star ${c.starred ? 'active' : ''}`}
                    style={{ cursor: 'pointer' }}
                  >
                    {c.starred ? '★' : '☆'}
                  </span>
                </td>
                <td className="crm-table-name">{c.name}</td>
                <td>
                  <span className={`crm-badge-pill ${statusPill(c.status)}`}>{c.status}</span>
                </td>
                <td>
                  <span className="crm-team-num">{c.score}</span>
                </td>
                <td>{c.sector || '—'}</td>
                <td>{c.city || '—'}</td>
                <td>{(c.salespersonId && spName.get(c.salespersonId)) || '—'}</td>
                <td
                  style={{
                    color:
                      d == null || d > 60
                        ? 'var(--c-danger)'
                        : d > 30
                          ? 'var(--c-muted)'
                          : 'inherit',
                  }}
                >
                  {d == null ? 'Nunca' : d === 0 ? 'Hoje' : `há ${d} d`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function statusPill(s: string) {
  return s === 'Ativo'
    ? 'pill-green'
    : s === 'Contactado'
      ? 'pill-blue'
      : s === 'Inativo'
        ? 'pill-grey'
        : 'pill-amber';
}
