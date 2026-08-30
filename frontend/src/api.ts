import type {
  Client,
  Activity,
  Interlocutor,
  Deal,
  AgendaEvent,
  Salesperson,
  Competition,
  ClientSummary,
  Briefing,
  Silence,
  Forecast,
  DuplicateGroup,
  AuditEntry,
  ScoreDetalhe,
} from './types';
import { readThrough, writeThrough, apiFetch } from './offline';

/**
 * Todas as chamadas passam pela camada offline (ver offline.ts):
 * leituras servem cache quando não há rede, escritas entram em fila.
 */
const get = readThrough;
const post = <T>(path: string, collection: string, body: unknown) =>
  writeThrough<T>('POST', path, collection, body);
const put = <T>(path: string, collection: string, body: unknown) =>
  writeThrough<T>('PUT', path, collection, body);
const del = (path: string, collection: string) => writeThrough<void>('DELETE', path, collection);

export const api = {
  clients: {
    /**
     * Carteira completa. A app filtra e ordena do lado do cliente, por isso
     * precisa mesmo de todos os registos.
     *
     * A resposta é normalizada para array: se algum dia esta rota passar a
     * paginar por omissão, a UI não rebenta — só deixa de ver o resto.
     */
    list: async () => {
      const r = await get<Client[] | { data: Client[] }>('/clients');
      return Array.isArray(r) ? r : (r?.data ?? []);
    },
    /**
     * Página de clientes, para carteiras grandes: `{ data, total, limit, offset }`.
     * O `page=1` é o que ativa o modo paginado no servidor.
     */
    page: (opts: { limit?: number; offset?: number; q?: string } = {}) => {
      const p = new URLSearchParams({ page: '1' });
      if (opts.limit) p.set('limit', String(opts.limit));
      if (opts.offset) p.set('offset', String(opts.offset));
      if (opts.q) p.set('q', opts.q);
      return get<{ data: Client[]; total: number; limit: number; offset: number }>(
        `/clients?${p.toString()}`,
      );
    },
    /** Métricas por cliente numa só chamada — evita 1 pedido por cliente. */
    summary: () => get<ClientSummary[]>('/clients/summary'),
    create: (d: Partial<Client>) => post<Client>('/clients', '/clients', d),
    update: (id: string, d: Partial<Client>) => put<Client>(`/clients/${id}`, '/clients', d),
    remove: (id: string) => del(`/clients/${id}`, '/clients'),
    /**
     * Importação em massa. Não passa pela fila offline de propósito: importar
     * um ficheiro sem rede e só descobrir o resultado meia hora depois não
     * ajuda ninguém. Reservado a administradores no servidor.
     */
    importar: (rows: Record<string, string>[]) =>
      apiFetch('/clients/import', { method: 'POST', body: JSON.stringify({ rows }) }) as Promise<{
        ok: boolean;
        inserted: number;
        skipped: number;
        errors: string[];
      }>,
  },
  activities: {
    listByClient: (cid: string) => get<Activity[]>(`/clients/${cid}/activities`),
    /** Atividades recentes de toda a carteira, numa só chamada. */
    recent: (limit = 400) => get<Activity[]>(`/activities/recent?limit=${limit}`),
    create: (cid: string, d: Partial<Activity>) =>
      post<Activity>(`/clients/${cid}/activities`, `/clients/${cid}/activities`, d),
    remove: (id: string, cid: string) => del(`/activities/${id}`, `/clients/${cid}/activities`),
  },
  interlocutors: {
    listByClient: (cid: string) => get<Interlocutor[]>(`/clients/${cid}/interlocutors`),
    create: (cid: string, d: Partial<Interlocutor>) =>
      post<Interlocutor>(`/clients/${cid}/interlocutors`, `/clients/${cid}/interlocutors`, d),
    update: (id: string, cid: string, d: Partial<Interlocutor>) =>
      put<Interlocutor>(`/interlocutors/${id}`, `/clients/${cid}/interlocutors`, d),
    remove: (id: string, cid: string) =>
      del(`/interlocutors/${id}`, `/clients/${cid}/interlocutors`),
  },
  deals: {
    list: () => get<Deal[]>('/deals'),
    listByClient: (cid: string) => get<Deal[]>(`/clients/${cid}/deals`),
    create: (d: Partial<Deal>) => post<Deal>('/deals', '/deals', d),
    update: (id: string, d: Partial<Deal>) => put<Deal>(`/deals/${id}`, '/deals', d),
    remove: (id: string) => del(`/deals/${id}`, '/deals'),
  },
  agenda: {
    list: () => get<AgendaEvent[]>('/agenda'),
    listByClient: (cid: string) => get<AgendaEvent[]>(`/clients/${cid}/agenda`),
    create: (d: Partial<AgendaEvent>) => post<AgendaEvent>('/agenda', '/agenda', d),
    update: (id: string, d: Partial<AgendaEvent>) =>
      put<AgendaEvent>(`/agenda/${id}`, '/agenda', d),
    remove: (id: string) => del(`/agenda/${id}`, '/agenda'),
  },
  salespeople: {
    list: () => get<Salesperson[]>('/salespeople'),
    create: (d: Partial<Salesperson>) => post<Salesperson>('/salespeople', '/salespeople', d),
    remove: (id: string) => del(`/salespeople/${id}`, '/salespeople'),
  },
  competition: {
    list: () => get<Competition[]>('/competition'),
    listByClient: (cid: string) => get<Competition[]>(`/clients/${cid}/competition`),
    create: (d: Partial<Competition>) => post<Competition>('/competition', '/competition', d),
    update: (id: string, d: Partial<Competition>) =>
      put<Competition>(`/competition/${id}`, '/competition', d),
    remove: (id: string) => del(`/competition/${id}`, '/competition'),
  },

  /** Análises calculadas no servidor. Leituras puras, logo passam pelo cache. */
  insights: {
    briefing: () => get<Briefing>('/insights/briefing'),
    silence: () => get<Silence>('/insights/silence'),
    forecast: () => get<Forecast>('/insights/forecast'),
    duplicates: () => get<DuplicateGroup[]>('/insights/duplicates'),
    audit: (cid: string) => get<AuditEntry[]>(`/clients/${cid}/audit`),
    /** Score de um cliente com a decomposição por sinal. */
    score: (cid: string) => get<ScoreDetalhe>(`/clients/${cid}/score`),
  },

  /**
   * Chamadas à IA.
   *
   * Não passam pelo cache nem pela fila offline: uma pergunta à IA feita sem
   * rede não deve ser reenviada meia hora depois, quando já não faz sentido.
   */
  ia: {
    status: () => apiFetch('/ia-status'),
    chat: (body: {
      messages: { role: string; content: string }[];
      scope?: 'global' | 'client';
      clientId?: string;
      system?: string;
      context?: string;
    }) => apiFetch('/ia-chat', { method: 'POST', body: JSON.stringify(body) }),
    news: (body: unknown) => apiFetch('/ia-news', { method: 'POST', body: JSON.stringify(body) }),
    email: (body: unknown) => apiFetch('/ia-email', { method: 'POST', body: JSON.stringify(body) }),
  },
};
