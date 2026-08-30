import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Client } from '../types';
import { initialsOf, type AuthUser } from '../auth';

/**
 * Header global fixo — padrão comum aos 5 líderes (ver INVESTIGACAO/layout.md):
 * pesquisa universal com atalho de teclado, criação rápida e perfil.
 */

interface Props {
  clients: Client[];
  theme: string;
  onTheme: (t: string) => void;
  onCommand: () => void;
  user: AuthUser;
  onLogout: () => void;
}

/** Título por rota — comparado por prefixo, para cobrir `/clientes/:id`. */
const ROUTE_TITLES: [string, string][] = [
  ['/hoje', 'O meu dia'],
  ['/dashboard', 'Dashboard'],
  ['/clientes', 'Clientes'],
  ['/pipeline', 'Pipeline'],
  ['/mapa', 'Mapa'],
  ['/agenda', 'Agenda'],
  ['/seguimento', 'Follow-up'],
  ['/equipa', 'Equipa'],
  ['/concorrencia', 'Concorrência'],
  ['/ia', 'Assistente IA'],
  ['/acessos', 'Acessos'],
];

function tituloDaRota(pathname: string): string {
  const hit = ROUTE_TITLES.find(([p]) => pathname === p || pathname.startsWith(p + '/'));
  return hit?.[1] ?? '';
}

export default function GlobalHeader({
  clients,
  theme,
  onTheme,
  onCommand,
  user,
  onLogout,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Cmd+K / Ctrl+K abre a pesquisa em qualquer sítio da app
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else {
      setQ('');
      setCursor(0);
    }
  }, [open]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return clients
      .filter((c) =>
        [c.name, c.nif, c.sector, c.city, c.email, c.phone, c.contact]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(term)),
      )
      .slice(0, 8);
  }, [clients, q]);

  function choose(id: string) {
    navigate(`/clientes/${id}`);
    setOpen(false);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    }
    if (e.key === 'Enter' && results[cursor]) {
      e.preventDefault();
      choose(results[cursor].id);
    }
  }

  return (
    <>
      <header className="crm-header">
        <div className="crm-header-title">{tituloDaRota(location.pathname)}</div>

        <button className="crm-header-search" onClick={() => setOpen(true)}>
          <span className="crm-header-search-icon">⌕</span>
          <span>Pesquisar clientes…</span>
          <kbd className="crm-kbd">Ctrl K</kbd>
        </button>

        <button
          className="crm-header-cmd"
          onClick={onCommand}
          title="Registar por comando ou voz (Ctrl+Shift+K)"
        >
          <svg
            width="14"
            height="14"
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
          <span>Comando</span>
          <kbd className="crm-kbd" style={{ marginLeft: 0 }}>
            ⇧K
          </kbd>
        </button>

        <div className="crm-header-actions">
          <select
            className="crm-viewbar-select"
            value={theme}
            aria-label="Estilo visual"
            onChange={(e) => onTheme(e.target.value)}
            title="Estilo visual — cada um replica o design system de um dos 5 CRMs líderes"
          >
            <option value="claro-1">Claro 1</option>
            <option value="claro-2">Claro 2</option>
            <option value="escuro">Escuro</option>
          </select>
          <button
            className="crm-header-new"
            onClick={() => navigate('/clientes?novo=1')}
            title="Novo cliente"
          >
            <span>+</span>
            <span className="crm-header-new-lbl">Novo</span>
          </button>
          <button
            className="crm-header-avatar"
            title={`${user.name} — clica para sair`}
            onClick={() => {
              if (confirm('Terminar sessão?')) onLogout();
            }}
          >
            {initialsOf(user)}
          </button>
        </div>
      </header>

      {open && (
        <div
          className="crm-cmdk-bg"
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="crm-cmdk">
            <input
              ref={inputRef}
              className="crm-cmdk-input"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setCursor(0);
              }}
              onKeyDown={onInputKey}
              placeholder="Pesquisar por nome, NIF, setor, cidade, email…"
            />
            <div className="crm-cmdk-results">
              {!q.trim() && (
                <div className="crm-cmdk-hint">
                  Escreve para procurar em toda a carteira. ↑↓ para navegar, Enter para abrir.
                </div>
              )}
              {q.trim() && results.length === 0 && (
                <div className="crm-cmdk-hint">Sem resultados para “{q}”.</div>
              )}
              {results.map((c, i) => (
                <button
                  key={c.id}
                  className={`crm-cmdk-item ${i === cursor ? 'active' : ''}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(c.id)}
                >
                  <div className="crm-cmdk-item-main">{c.name}</div>
                  <div className="crm-cmdk-item-sub">
                    {[c.status, c.sector, c.city].filter(Boolean).join(' · ')}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
