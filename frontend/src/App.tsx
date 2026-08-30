import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import GlobalHeader from './components/GlobalHeader';
import HojePage from './pages/HojePage';
import ClientsPage from './pages/ClientsPage';
import CommandBar from './components/CommandBar';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const PipelinePage = lazy(() => import('./pages/PipelinePage'));
const MapaPage = lazy(() => import('./pages/MapaPage'));
const AgendaPage = lazy(() => import('./pages/AgendaPage'));
const IaPage = lazy(() => import('./pages/IaPage'));
const EquipaPage = lazy(() => import('./pages/EquipaPage'));
const ConcorrenciaPage = lazy(() => import('./pages/ConcorrenciaPage'));
const Diagnostico = lazy(() => import('./pages/Diagnostico'));
import type { Client } from './types';
import { api } from './api';
import { lerCsv } from './csv';
import { apiFetch } from './offline';
import LoginPage from './components/LoginPage';
import { verifySession, clearSession, type AuthUser } from './auth';
import { hoje } from './datas';

/**
 * Temas disponíveis.
 *
 * Ao nível do módulo, não dentro do componente: `useState(temaGuardado)` corre
 * no primeiro render e leria a constante antes de ela existir.
 *
 * Um valor guardado que já não exista — de uma versão anterior, por exemplo —
 * cai no primeiro tema em vez de deixar a aplicação sem tema nenhum.
 */
const TEMAS = ['claro-1', 'claro-2', 'escuro'] as const;

function temaGuardado(): string {
  const t = localStorage.getItem('crm_theme');
  return t && (TEMAS as readonly string[]).includes(t) ? t : 'claro-1';
}

export default function App() {
  const navigate = useNavigate();

  // Sessão: null = ainda a verificar, undefined = sem sessão
  const [user, setUser] = useState<AuthUser | null | undefined>(null);

  useEffect(() => {
    verifySession().then((u) => setUser(u ?? undefined));
    // O interceptor da API avisa quando o token deixa de ser aceite
    const onUnauth = () => setUser(undefined);
    window.addEventListener('crm:unauthorized', onUnauth);
    return () => window.removeEventListener('crm:unauthorized', onUnauth);
  }, []);

  /**
   * O menu de diagnóstico existe para quem o servidor deixar entrar, e é o
   * servidor a decidir: pergunta-se, em vez de comparar aqui o endereço da
   * conta. Escrito no frontend, esse endereço ia no pacote de JavaScript que
   * qualquer visitante descarrega — bastava abrir as ferramentas do browser
   * para saber que conta procurar.
   */
  // null enquanto se pergunta: a rota nao pode decidir antes da resposta,
  // senao abrir /acessos pelo endereco atira para fora antes de saber.
  const [temDiagnostico, setTemDiagnostico] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return setTemDiagnostico(false);
    let vivo = true;
    apiFetch('/diagnostico/acessos')
      .then(() => vivo && setTemDiagnostico(true))
      .catch(() => vivo && setTemDiagnostico(false));
    return () => {
      vivo = false;
    };
  }, [user]);

  const [clients, setClients] = useState<Client[]>([]);
  const [theme, setTheme] = useState(temaGuardado);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('crm_side') === '1');
  const [cmdOpen, setCmdOpen] = useState(false);
  const [toast, setToast] = useState('');

  // Ctrl/Cmd+Shift+K abre a barra de comando (Ctrl+K é a pesquisa)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3200);
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('crm_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('crm_side', collapsed ? '1' : '0');
  }, [collapsed]);

  const reload = useCallback(() => {
    api.clients.list().then(setClients).catch(console.error);
  }, []);

  /* Só carregar depois de haver sessão. Sem esta condição o pedido partia no
     mount, sem token, e cada arranque começava com dois 401 na consola e um
     evento `crm:unauthorized` disparado sem necessidade. */
  useEffect(() => {
    if (user) reload();
  }, [user, reload]);

  /**
   * Importar CSV.
   *
   * Um `<input type="file">` escondido, acionado por código: o input nativo
   * não se estiliza e ficaria deslocado na sidebar.
   */
  function importarCsv() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';

    input.onchange = async () => {
      const ficheiro = input.files?.[0];
      if (!ficheiro) return;

      try {
        const { linhas, colunasIgnoradas } = lerCsv(await ficheiro.text());
        if (!linhas.length) {
          alert('Nenhuma linha encontrada. Confirma que o ficheiro tem cabeçalho e dados.');
          return;
        }

        const aviso = colunasIgnoradas.length
          ? `\n\nColunas ignoradas (nome desconhecido): ${colunasIgnoradas.join(', ')}`
          : '';
        if (!confirm(`Importar ${linhas.length} linha(s)?${aviso}`)) return;

        const r = await api.clients.importar(linhas);
        reload();

        const partes = [`${r.inserted} importado(s)`];
        if (r.skipped) partes.push(`${r.skipped} ignorado(s) por já existirem`);
        if (r.errors?.length) partes.push(`${r.errors.length} com erro`);
        const detalhe = r.errors?.length ? `\n\n${r.errors.slice(0, 5).join('\n')}` : '';
        alert(partes.join(' · ') + detalhe);
      } catch (e) {
        alert(`Não foi possível importar: ${e instanceof Error ? e.message : String(e)}`);
      }
    };

    input.click();
  }

  function exportCsv() {
    const cols: (keyof Client)[] = [
      'name',
      'nif',
      'sector',
      'status',
      'score',
      'contact',
      'email',
      'phone',
      'city',
    ];
    const rows = clients.map((c) =>
      cols.map((k) => `"${String(c[k] ?? '').replace(/"/g, '""')}"`).join(','),
    );
    const blob = new Blob(['﻿' + [cols.join(','), ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes-${hoje()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (user === null) {
    return <div className="crm-boot">A carregar…</div>;
  }
  if (user === undefined) {
    return (
      <LoginPage
        onLogin={(u) => {
          setUser(u);
          reload();
        }}
      />
    );
  }

  return (
    <div className={`crm-layout ${collapsed ? 'side-collapsed' : ''}`}>
      <Sidebar
        onExport={exportCsv}
        onImport={importarCsv}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        onCommand={() => setCmdOpen(true)}
        extra={temDiagnostico === true}
      />
      <div className="crm-content">
        <GlobalHeader
          clients={clients}
          theme={theme}
          onTheme={setTheme}
          onCommand={() => setCmdOpen(true)}
          user={user}
          onLogout={() => {
            clearSession();
            setUser(undefined);
          }}
        />

        <div className="crm-scroll">
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<Navigate to="/hoje" replace />} />
              <Route path="/hoje" element={<HojePage />} />
              <Route path="/dashboard" element={<DashboardPage clients={clients} />} />
              <Route
                path="/clientes"
                element={<ClientsPage clients={clients} onReload={reload} />}
              />
              <Route
                path="/clientes/:id"
                element={<ClientsPage clients={clients} onReload={reload} />}
              />
              <Route path="/pipeline" element={<PipelinePage clients={clients} />} />
              <Route
                path="/mapa"
                element={
                  <MapaPage clients={clients} onOpenClient={(id) => navigate(`/clientes/${id}`)} />
                }
              />
              <Route path="/agenda" element={<AgendaPage clients={clients} kind="agenda" />} />
              <Route
                path="/seguimento"
                element={<AgendaPage clients={clients} kind="followup" />}
              />
              <Route path="/equipa" element={<EquipaPage clients={clients} />} />
              <Route path="/concorrencia" element={<ConcorrenciaPage clients={clients} />} />
              <Route path="/ia" element={<IaPage clients={clients} />} />
              <Route
                path="/acessos"
                element={
                  temDiagnostico === null ? null : temDiagnostico ? (
                    <Diagnostico />
                  ) : (
                    <Navigate to="/hoje" replace />
                  )
                }
              />
              <Route path="*" element={<Navigate to="/hoje" replace />} />
            </Routes>
          </Suspense>
        </div>
      </div>

      <CommandBar
        clients={clients}
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onDone={(m) => {
          showToast(m);
          reload();
        }}
        onOpenClient={(id) => navigate(`/clientes/${id}`)}
      />

      {toast && <div className="crm-toast">✓ {toast}</div>}
    </div>
  );
}
