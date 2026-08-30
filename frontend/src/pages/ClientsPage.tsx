import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Client, Interlocutor, Salesperson, ClientSummary } from '../types';
import { api } from '../api';
import ClientList from '../components/ClientList';
import ClientTable from '../components/ClientTable';
import ClientRecord from '../components/ClientRecord';
import ClientModal from '../components/ClientModal';
import ViewBar, { VIEWS, type ViewId } from '../components/ViewBar';
import { useEcraPequeno } from '../hooks/useEcraPequeno';

interface Props {
  clients: Client[];
  onReload: () => void;
}

export default function ClientsPage({ clients, onReload }: Props) {
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedId, setSelectedId] = useState<string | null>(params.id ?? null);
  const [modalClient, setModalClient] = useState<Client | null | undefined>(undefined);
  const [interlocutors, setInterlocutors] = useState<Interlocutor[]>([]);
  const [people, setPeople] = useState<Salesperson[]>([]);
  const [summary, setSummary] = useState<ClientSummary[]>([]);

  const ecraPequeno = useEcraPequeno();
  /**
   * Em ecrã estreito mostra-se a lista OU a ficha, nunca as duas.
   *
   * Empilhadas, era preciso rolar por vinte clientes para chegar ao detalhe do
   * que se escolheu — e não havia forma de voltar. Este é o padrão
   * lista-detalhe que qualquer app móvel usa.
   *
   * A vista deriva diretamente da rota (`/clientes` = lista, `/clientes/:id` =
   * ficha): o botão físico de "voltar" do telemóvel já fecha a ficha sozinho,
   * porque é o próprio router a tratar a navegação para trás — sem
   * `history.pushState`/`popstate` manuais.
   */
  const vistaMovel: 'lista' | 'ficha' = ecraPequeno && params.id ? 'ficha' : 'lista';

  const [view, setView] = useState<ViewId>(
    () => (localStorage.getItem('crm_view') as ViewId) || 'todos',
  );
  const [layout, setLayout] = useState<'lista' | 'tabela'>(
    () => (localStorage.getItem('crm_layout') as 'lista' | 'tabela') || 'lista',
  );
  const [ownerFilter, setOwnerFilter] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    localStorage.setItem('crm_view', view);
  }, [view]);
  useEffect(() => {
    localStorage.setItem('crm_layout', layout);
  }, [layout]);

  useEffect(() => {
    api.salespeople.list().then(setPeople).catch(console.error);
  }, []);

  // Métricas por cliente numa só chamada agregada. Antes era um pedido por
  // cliente (N+1): com 500 clientes eram 500 pedidos para desenhar a lista.
  useEffect(() => {
    if (!clients.length) return;
    api.clients.summary().then(setSummary).catch(console.error);
  }, [clients.length]);

  const selected = clients.find((c) => c.id === selectedId) || null;

  /**
   * Abrir um cliente navega para `/clientes/:id` — o URL passa a ser a fonte
   * da verdade. A primeira abertura empilha no histórico (para o botão de
   * voltar fechar a ficha); trocar de cliente já dentro da ficha substitui a
   * entrada em vez de empilhar mais uma por cada clique na lista.
   */
  function abrirCliente(id: string) {
    navigate(`/clientes/${id}`, { replace: Boolean(params.id) });
  }

  // Sincroniza o estado local com o parâmetro da rota (deep link, navegação
  // pela pesquisa global, "voltar" do browser).
  useEffect(() => {
    if (params.id) setSelectedId(params.id);
  }, [params.id]);

  // Em `/clientes` (sem id), mostra o primeiro cliente por omissão —
  // relevante em ecrã largo, onde a lista e a ficha aparecem lado a lado.
  useEffect(() => {
    if (!params.id && !selectedId && clients.length) setSelectedId(clients[0].id);
  }, [clients, params.id, selectedId]);

  // Pedido de "novo cliente" vindo de fora da página (botão do header),
  // sinalizado por `?novo=1` — consumido uma vez e depois limpo do URL.
  useEffect(() => {
    if (!searchParams.get('novo')) return;
    setModalClient(null);
    searchParams.delete('novo');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedId) {
      setInterlocutors([]);
      return;
    }
    api.interlocutors.listByClient(selectedId).then(setInterlocutors).catch(console.error);
  }, [selectedId]);

  /** Dias desde o último contacto, já calculados pelo servidor. */
  const daysSince = useMemo(() => {
    const out = new Map<string, number | null>();
    for (const c of clients) out.set(c.id, null);
    for (const s of summary) out.set(s.clientId, s.daysSinceContact);
    return out;
  }, [summary, clients]);

  const myId = people[0]?.id;
  const counts = useMemo(() => {
    const o = {} as Record<ViewId, number>;
    for (const v of VIEWS)
      o[v.id] = clients.filter((c) => v.match(c, { ownerId: myId, daysSince })).length;
    return o;
  }, [clients, myId, daysSince]);

  const visible = useMemo(() => {
    const def = VIEWS.find((v) => v.id === view)!;
    let list = clients.filter((c) => def.match(c, { ownerId: myId, daysSince }));
    if (ownerFilter) list = list.filter((c) => c.salespersonId === ownerFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((c) =>
        [c.name, c.nif, c.sector, c.contact, c.email, c.phone, c.city, c.notes]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)),
      );
    }
    return [...list].sort(
      (a, b) =>
        Number(!!b.starred) - Number(!!a.starred) ||
        (b.score || 0) - (a.score || 0) ||
        a.name.localeCompare(b.name, 'pt'),
    );
  }, [clients, view, ownerFilter, query, myId, daysSince]);

  async function toggleStar(id: string) {
    const c = clients.find((x) => x.id === id);
    if (!c) return;
    await api.clients.update(id, { ...c, starred: !c.starred });
    onReload();
  }

  /** Grava um subconjunto de campos sem abrir modal (edição inline). */
  async function patch(patchData: Partial<Client>) {
    if (!selected) return;
    await api.clients.update(selected.id, { ...selected, ...patchData });
    onReload();
  }

  async function save(data: Partial<Client>) {
    if (modalClient) await api.clients.update(modalClient.id, { ...modalClient, ...data });
    else {
      const created = await api.clients.create(data);
      abrirCliente(created.id);
    }
    setModalClient(undefined);
    onReload();
  }

  async function addInterlocutor(data: Partial<Interlocutor>) {
    if (!selectedId) return;
    const created = await api.interlocutors.create(selectedId, data);
    setInterlocutors((p) => [...p, created]);
  }

  async function removeInterlocutor(id: string) {
    if (!selectedId) return;
    await api.interlocutors.remove(id, selectedId);
    setInterlocutors((p) => p.filter((i) => i.id !== id));
  }

  return (
    <>
      <ViewBar
        view={view}
        onView={setView}
        counts={counts}
        people={people}
        ownerFilter={ownerFilter}
        onOwnerFilter={setOwnerFilter}
        layout={layout}
        onLayout={setLayout}
        total={visible.length}
      />

      {layout === 'tabela' ? (
        <ClientTable
          clients={visible}
          people={people}
          daysSince={daysSince}
          selectedId={selectedId}
          onSelect={(id) => {
            abrirCliente(id);
            setLayout('lista');
          }}
          onToggleStar={toggleStar}
        />
      ) : (
        <div className="crm-clients-grid" data-vista-movel={ecraPequeno ? vistaMovel : undefined}>
          <ClientList
            clients={visible}
            people={people}
            daysSince={daysSince}
            selectedId={selectedId}
            onSelect={abrirCliente}
            onNew={() => setModalClient(null)}
            onToggleStar={toggleStar}
            query={query}
            onQuery={setQuery}
          />
          <ClientRecord
            client={selected}
            onVoltar={ecraPequeno ? () => navigate('/clientes') : undefined}
            allClients={clients}
            interlocutors={interlocutors}
            onEdit={() => selected && setModalClient(selected)}
            onPatch={patch}
            onAddInterlocutor={addInterlocutor}
            onRemoveInterlocutor={removeInterlocutor}
          />
        </div>
      )}

      {modalClient !== undefined && (
        <ClientModal
          client={modalClient}
          allClients={clients}
          onClose={() => setModalClient(undefined)}
          onSave={save}
          onDelete={async () => {
            if (!modalClient || !confirm(`Eliminar "${modalClient.name}"?`)) return;
            await api.clients.remove(modalClient.id);
            setModalClient(undefined);
            setSelectedId(null);
            if (params.id) navigate('/clientes');
            onReload();
          }}
        />
      )}
    </>
  );
}
