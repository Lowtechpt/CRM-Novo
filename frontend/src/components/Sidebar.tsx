import type { ReactElement } from 'react';
import { NavLink } from 'react-router-dom';
import SyncIndicator from './SyncIndicator';

/**
 * Site Map agrupado por áreas de negócio — padrão Dynamics 365
 * (INVESTIGACAO/layout.md §3: "Customers / Sales / Collateral / Performance").
 * Ícones SVG reais em vez de siglas de duas letras.
 */
const GROUPS: { title: string; items: { path: string; label: string; icon: ReactElement }[] }[] = [
  {
    title: 'Hoje',
    items: [{ path: '/hoje', label: 'O meu dia', icon: <IconSun /> }],
  },
  {
    title: 'Clientes',
    items: [
      { path: '/clientes', label: 'Clientes', icon: <IconUsers /> },
      { path: '/mapa', label: 'Mapa', icon: <IconMap /> },
      { path: '/concorrencia', label: 'Concorrência', icon: <IconSwords /> },
    ],
  },
  {
    title: 'Vendas',
    items: [
      { path: '/pipeline', label: 'Pipeline', icon: <IconKanban /> },
      { path: '/agenda', label: 'Agenda', icon: <IconCalendar /> },
      { path: '/seguimento', label: 'Follow-up', icon: <IconBell /> },
    ],
  },
  {
    title: 'Desempenho',
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: <IconChart /> },
      { path: '/equipa', label: 'Equipa', icon: <IconTeam /> },
      { path: '/ia', label: 'Assistente IA', icon: <IconSpark /> },
    ],
  },
];

interface Props {
  onExport: () => void;
  onImport: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onCommand: () => void;
  /** Fora do site map: só existe para quem a App decide mostrar. */
  extra?: boolean;
}

export default function Sidebar({
  onExport,
  onImport,
  collapsed,
  onToggleCollapse,
  onCommand,
  extra,
}: Props) {
  return (
    <div className={`crm-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="crm-side-brand">
        <div className="crm-side-mark">CRM</div>
        {!collapsed && (
          <div className="crm-side-brand-txt">
            <div className="crm-side-title">CRM Vendas</div>
            <div className="crm-side-sub">Gestão comercial</div>
          </div>
        )}
        <button
          className="crm-side-collapse"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Registo rápido — sítio fixo e visível, não só o atalho de teclado */}
      <button
        className="crm-side-cmd"
        onClick={onCommand}
        title="Registar por comando ou voz (Ctrl+Shift+K)"
        aria-label="Registar por comando ou voz"
      >
        <IconMic />
        {!collapsed && <span>Registar / Ditar</span>}
      </button>

      <nav className="crm-side-nav">
        {GROUPS.map((g) => (
          <div key={g.title} className="crm-nav-group">
            {!collapsed && <div className="crm-nav-section">{g.title}</div>}
            {g.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `crm-nav-item ${isActive ? 'active' : ''}`}
                title={collapsed ? item.label : undefined}
                /* O nome tem de existir sempre. Em ecrã estreito o CSS esconde
                   a etiqueta e ficava um botão só com ícone: sem nome para
                   leitores de ecrã e sem forma de o identificar em testes. */
                aria-label={item.label}
              >
                <span className="crm-nav-icon">{item.icon}</span>
                {!collapsed && <span className="crm-nav-label">{item.label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
        {extra && (
          <div className="crm-nav-group">
            {!collapsed && <div className="crm-nav-section">Acessos</div>}
            <NavLink
              to="/acessos"
              className={({ isActive }) => `crm-nav-item ${isActive ? 'active' : ''}`}
              title={collapsed ? 'Acessos' : undefined}
              aria-label="Acessos"
            >
              <span className="crm-nav-icon">
                <IconChart />
              </span>
              {!collapsed && <span className="crm-nav-label">Acessos</span>}
            </NavLink>
          </div>
        )}
      </nav>

      <div className="crm-side-footer">
        {!collapsed && <SyncIndicator />}
        <button className="crm-side-btn" onClick={onImport} title="Importar CSV">
          <IconUpload />
          {!collapsed && <span>Importar CSV</span>}
        </button>
        <button className="crm-side-btn" onClick={onExport} title="Exportar CSV">
          <IconDownload />
          {!collapsed && <span>Exportar CSV</span>}
        </button>
      </div>
    </div>
  );
}

/* ── Ícones (stroke, 20px, um só estilo) ── */
const S = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function IconUsers() {
  return (
    <svg {...S}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconMap() {
  return (
    <svg {...S}>
      <path d="M9 20l-6 2V6l6-2m0 16l6 2m-6-2V4m6 18l6-2V4l-6 2m0 16V6" />
    </svg>
  );
}
function IconSwords() {
  return (
    <svg {...S}>
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
      <path d="m13 19 6-6M16 16l4 4M19 21l2-2" />
      <path d="M14.5 6.5 18 3h3v3l-3.5 3.5" />
      <path d="m5 14 4 4M3 21l2-2" />
    </svg>
  );
}
function IconKanban() {
  return (
    <svg {...S}>
      <rect x="3" y="3" width="6" height="13" rx="1" />
      <rect x="15" y="3" width="6" height="9" rx="1" />
      <path d="M9 21h.01M21 21h.01" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg {...S}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg {...S}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg {...S}>
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  );
}
function IconTeam() {
  return (
    <svg {...S}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconSpark() {
  return (
    <svg {...S}>
      <path d="m12 3-1.9 5.8L4 10.5l6.1 1.7L12 18l1.9-5.8L20 10.5l-6.1-1.7L12 3Z" />
      <path d="M19 3v4M21 5h-4" />
    </svg>
  );
}
function IconMic() {
  return (
    <svg {...S} width={16} height={16}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
    </svg>
  );
}
function IconSun() {
  return (
    <svg {...S}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
    </svg>
  );
}
function IconUpload() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg {...S} width={15} height={15}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5M12 15V3" />
    </svg>
  );
}
