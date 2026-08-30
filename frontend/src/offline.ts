/**
 * Camada offline-first.
 *
 * Porquê: a investigação (INVESTIGACAO/top5-crms-mundiais.md, secção 4) mostra que
 * 50-63% das implementações de CRM falham por não adoção, e que no terreno
 * "uma visita que não sincronizou é indistinguível de uma visita que nunca aconteceu".
 * Nenhum dos Top 5 resolve isto bem.
 *
 * Como: GETs são cacheados em IndexedDB e servidos quando não há rede.
 * Mutações feitas offline entram numa fila durável e são aplicadas de forma
 * otimista ao cache, para a UI reagir de imediato. Ao voltar a rede, a fila é
 * drenada por ordem de criação.
 */

const DB_NAME = 'crm-offline';
const DB_VERSION = 1;
const STORE_CACHE = 'cache';
const STORE_QUEUE = 'queue';

export interface QueuedMutation {
  id: string;
  method: 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  /** Coleção afetada, para reconciliar o cache (ex.: '/clients'). */
  collection: string;
  /** Id temporário atribuído a uma criação feita offline. */
  tempId?: string;
  createdAt: number;
  /**
   * Número de sequência monótono.
   *
   * A ordem da fila era dada por `createdAt`, que é `Date.now()` — resolução
   * de um milissegundo. Criar um cliente e logo a seguir um negócio para esse
   * cliente cabe folgadamente no mesmo milissegundo, e nesse caso a ordem
   * ficava indefinida: o negócio podia ser enviado primeiro, com um id de
   * cliente que ainda não existia no servidor.
   *
   * É a garantia de ordem causal que a fila promete, e não se pode apoiar num
   * relógio. Este contador é persistido com a mutação e retomado do maior
   * valor em fila, para sobreviver a recarregamentos.
   */
  seq: number;
}

/** Mutação que o servidor recusou de vez e saiu da fila. */
export interface RejectedMutation {
  method: 'POST' | 'PUT' | 'DELETE';
  path: string;
  collection: string;
  motivo: string;
  at: number;
}

export interface SyncState {
  online: boolean;
  pending: number;
  syncing: boolean;
  lastSync: number | null;
  lastError: string | null;
  /** Alterações recusadas pelo servidor. Nunca voltam sozinhas. */
  rejected: RejectedMutation[];
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) db.createObjectStore(STORE_CACHE);
      if (!db.objectStoreNames.contains(STORE_QUEUE))
        db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

/* ── Cache de leituras ── */

export const cacheGet = <T>(path: string) =>
  tx<T | undefined>(STORE_CACHE, 'readonly', (s) => s.get(path));
export const cacheSet = (path: string, data: unknown) =>
  tx<void>(STORE_CACHE, 'readwrite', (s) => s.put(data, path));

/* ── Fila de mutações ── */

export const queueAll = () =>
  tx<QueuedMutation[]>(STORE_QUEUE, 'readonly', (s) => s.getAll()).then((r) =>
    // `seq` primeiro: é o único critério com ordem total garantida.
    // `createdAt` fica como desempate para filas gravadas antes deste campo.
    (r || []).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.createdAt - b.createdAt),
  );

/** Contador de sequência, retomado da fila existente no primeiro uso. */
let ultimaSeq: number | null = null;
async function proximaSeq(): Promise<number> {
  if (ultimaSeq === null) {
    const fila = await queueAll();
    ultimaSeq = fila.reduce((max, m) => Math.max(max, m.seq ?? 0), 0);
  }
  return ++ultimaSeq;
}

const queueAdd = (m: QueuedMutation) => tx<void>(STORE_QUEUE, 'readwrite', (s) => s.put(m));
const queueRemove = (id: string) => tx<void>(STORE_QUEUE, 'readwrite', (s) => s.delete(id));

/* ── Estado observável ── */

/* `lastSync` sobrevive a recarregamentos. Em memória, a sidebar mostrava
   "Sincronizado" e, por baixo, "Última sincronização nunca" — duas afirmações
   contraditórias, porque o valor só era preenchido por um flush e um flush não
   corre com a fila vazia. */
const CHAVE_ULTIMA_SYNC = 'crm_last_sync';

function lerUltimaSync(): number | null {
  const v = Number(localStorage.getItem(CHAVE_ULTIMA_SYNC));
  return Number.isFinite(v) && v > 0 ? v : null;
}

const state: SyncState = {
  online: navigator.onLine,
  pending: 0,
  syncing: false,
  lastSync: lerUltimaSync(),
  lastError: null,
  rejected: [],
};

type Listener = (s: SyncState) => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  fn({ ...state });
  return () => listeners.delete(fn);
}

function emit(patch: Partial<SyncState>) {
  if (patch.lastSync) localStorage.setItem(CHAVE_ULTIMA_SYNC, String(patch.lastSync));
  Object.assign(state, patch);
  listeners.forEach((fn) => fn({ ...state }));
}

export async function refreshPending() {
  const q = await queueAll();
  emit({ pending: q.length });
}

/* ── Núcleo ── */

const BASE = '/api';
const tempId = () => `tmp_${crypto.randomUUID()}`;

/**
 * Pedido autenticado à API.
 *
 * É o único sítio onde o token é anexado — usar `fetch('/api/...')` cru salta
 * esta camada e recebe 401 em silêncio, com o corpo de erro a ser tratado como
 * se fossem dados. Foi assim que a página "O Meu Dia" e todas as funções de IA
 * deixaram de funcionar quando a autenticação foi introduzida.
 *
 * Ao contrário de `readThrough`/`writeThrough`, não guarda em cache nem põe em
 * fila: serve para pedidos que não fazem sentido offline (chamadas à IA).
 */
export const apiFetch = (path: string, init?: RequestInit) => netFetch(path, init);

/**
 * Erro vindo do servidor, com o código HTTP preservado.
 *
 * A distinção que interessa: um 400 significa que o pedido está errado e
 * repeti-lo daqui a uma hora dá exatamente o mesmo resultado; uma falha de rede
 * significa que o pedido pode estar certo e só falta ligação. Sem separar os
 * dois, tudo ia parar à fila de sincronização — incluindo erros de validação
 * obtidos com rede a funcionar.
 */
/** Formato dos erros de validação devolvidos pelo backend (zod). */
interface DetalheValidacao {
  campo: string;
  problema: string;
}

/**
 * Registo guardado no cache: tem sempre `id`, e ganha `_pending` enquanto a
 * mutação que o criou não chegou ao servidor.
 */
export interface RegistoEmCache {
  id: string;
  _pending?: boolean;
  [campo: string]: unknown;
}

export class ErroApi extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ErroApi';
  }

  /** Repetir isto mais tarde não vai mudar nada. */
  get definitivo(): boolean {
    // 401 caduca a sessão (vale a pena repetir depois do login), 408 e 429 são
    // temporários apesar de serem 4xx.
    if (this.status === 401 || this.status === 408 || this.status === 429) return false;
    return this.status >= 400 && this.status < 500;
  }
}

async function netFetch(path: string, init?: RequestInit) {
  const token = localStorage.getItem('crm_token');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });

  // Sessão caducada: limpa e força novo login em vez de falhar em silêncio
  if (res.status === 401) {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    window.dispatchEvent(new CustomEvent('crm:unauthorized'));
    throw new ErroApi('Sessão expirada. Entra novamente.', 401);
  }

  if (!res.ok) {
    // O backend devolve { error, details } — mostrar isso em vez do JSON cru
    let msg = `API ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) {
        msg = body.error;
        if (Array.isArray(body.details)) {
          msg += ` (${(body.details as DetalheValidacao[]).map((d) => `${d.campo}: ${d.problema}`).join('; ')})`;
        }
      }
    } catch {
      /* resposta sem corpo JSON */
    }
    throw new ErroApi(msg, res.status);
  }

  return res.status === 204 ? undefined : res.json();
}

/**
 * GET com fallback ao cache. Se a rede responder, atualiza o cache.
 * Se falhar, devolve o que estiver guardado (ou lança se nunca houve nada).
 */
export async function readThrough<T>(path: string): Promise<T> {
  try {
    const data = await netFetch(path);
    await cacheSet(path, data);
    // Uma leitura que chega ao servidor é, para o utilizador, sincronização:
    // sem isto o rótulo dizia "nunca" numa app que acabara de carregar dados.
    emit({ online: true, lastSync: Date.now() });
    return data as T;
  } catch (err) {
    // Uma recusa do servidor (403, 404, 400) não é falta de rede: servir o
    // cache aqui mostrava dados a que o utilizador já não tem acesso, e
    // marcava a app como "sem ligação" quando ela está perfeitamente ligada.
    if (err instanceof ErroApi && err.definitivo) {
      emit({ online: true });
      throw err;
    }

    const cached = await cacheGet<T>(path);
    if (cached !== undefined) {
      emit({ online: false });
      return cached;
    }
    throw err;
  }
}

/**
 * Mutação com fila. Tenta a rede; se falhar, guarda na fila e aplica ao cache
 * de forma otimista para a UI refletir a alteração de imediato.
 */
export async function writeThrough<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  collection: string,
  body?: unknown,
): Promise<T> {
  try {
    const data = await netFetch(path, { method, body: body ? JSON.stringify(body) : undefined });
    emit({ online: true, lastSync: Date.now(), lastError: null });
    await invalidate(collection);
    return data as T;
  } catch (err) {
    // Recusa do servidor não é falta de rede. Enfileirar um 400 mostrava ao
    // utilizador "1 por sincronizar" para sempre, com a alteração já recusada —
    // e, pior, bloqueava tudo o que viesse a seguir (ver `flush`).
    if (err instanceof ErroApi && err.definitivo) {
      emit({ online: true, lastError: err.message });
      throw err;
    }

    const tmp = method === 'POST' ? tempId() : undefined;
    const mutation: QueuedMutation = {
      id: crypto.randomUUID(),
      method,
      path,
      body,
      collection,
      tempId: tmp,
      createdAt: Date.now(),
      seq: await proximaSeq(),
    };
    await queueAdd(mutation);
    const optimistic = await applyOptimistic<T>(mutation);
    emit({ online: false });
    await refreshPending();
    return optimistic;
  }
}

/** Refaz o cache de uma coleção a partir da rede (best-effort). */
async function invalidate(collection: string) {
  try {
    const fresh = await netFetch(collection);
    await cacheSet(collection, fresh);
  } catch {
    /* sem rede: o cache otimista fica como está até à próxima sync */
  }
}

/** Aplica a mutação ao cache local para a UI não esperar pela rede. */
async function applyOptimistic<T>(m: QueuedMutation): Promise<T> {
  const list = (await cacheGet<RegistoEmCache[]>(m.collection)) || [];

  if (m.method === 'POST') {
    const item: RegistoEmCache = { ...(m.body as object), id: m.tempId!, _pending: true };
    await cacheSet(m.collection, [item, ...list]);
    return item as T;
  }

  const id = m.path.split('/').pop()!;

  if (m.method === 'PUT') {
    const item: RegistoEmCache = { ...(m.body as object), id, _pending: true };
    await cacheSet(
      m.collection,
      list.map((x) => (x.id === id ? item : x)),
    );
    return item as T;
  }

  await cacheSet(
    m.collection,
    list.filter((x) => x.id !== id),
  );
  return undefined as T;
}

/**
 * Drena a fila por ordem de criação.
 *
 * Duas políticas diferentes, consoante o erro:
 *
 * - **Recusado pelo servidor (4xx definitivo):** sai da fila e é registado em
 *   `rejected`. Antes ficava à cabeça e bloqueava tudo o que vinha atrás —
 *   uma edição inválida feita offline prendia todas as visitas e notas
 *   seguintes, para sempre, e o contador nunca descia. Era exatamente o
 *   cenário que este CRM diz resolver.
 * - **Falha de rede ou 5xx:** para e mantém a ordem. Repetir faz sentido, e a
 *   ordem causal importa (criar antes de editar o mesmo registo).
 */
/** Troca ids temporários por reais dentro de um texto. */
function substituirIds(texto: string, idMap: Map<string, string>): string {
  let saida = texto;
  for (const [tmp, real] of idMap) saida = saida.split(tmp).join(real);
  return saida;
}

/**
 * Reescreve ids temporários em qualquer ponto do corpo da mutação.
 *
 * Percorre a estrutura toda em vez de olhar só para campos conhecidos
 * (`clientId`, `dealId`, …): uma referência nova acrescentada mais tarde
 * passaria despercebida a uma lista fixa, e o sintoma — um registo que
 * desaparece ao sincronizar — é dos mais difíceis de diagnosticar.
 */
function reescreverCorpo(valor: unknown, idMap: Map<string, string>): unknown {
  if (!idMap.size) return valor;
  if (typeof valor === 'string') return substituirIds(valor, idMap);
  if (Array.isArray(valor)) return valor.map((v) => reescreverCorpo(v, idMap));
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).map(([k, v]) => [
        k,
        reescreverCorpo(v, idMap),
      ]),
    );
  }
  return valor;
}

export async function flush(): Promise<void> {
  if (state.syncing) return;
  const queue = await queueAll();
  if (!queue.length) return;

  emit({ syncing: true, lastError: null });
  const idMap = new Map<string, string>();
  const rejeitadas: RejectedMutation[] = [];

  try {
    for (const m of queue) {
      /* Uma criação offline gera um id temporário; tudo o que venha depois e
         se refira a esse registo tem de passar a apontar ao id real.
         Isso acontece em DOIS sítios, e durante muito tempo só um era tratado:
           - no caminho  — `PUT /clients/tmp_abc`
           - no CORPO    — `POST /deals` com `{ clientId: 'tmp_abc' }`
         Com o corpo por reescrever, o servidor recebia uma chave estrangeira
         inexistente, respondia 400, e a mutação era descartada como "recusada":
         o negócio criado no terreno desaparecia sem deixar rasto. */
      const path = substituirIds(m.path, idMap);
      const body = m.body === undefined ? undefined : reescreverCorpo(m.body, idMap);

      let result: { id?: string } | undefined;
      try {
        result = await netFetch(path, {
          method: m.method,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (err) {
        if (!(err instanceof ErroApi && err.definitivo)) throw err;

        // Recusada de vez: tirar da frente para não travar as seguintes.
        await queueRemove(m.id);
        rejeitadas.push({
          method: m.method,
          path: m.path,
          collection: m.collection,
          motivo: err.message,
          at: Date.now(),
        });
        await refreshPending();
        continue;
      }

      if (m.tempId && result?.id) idMap.set(m.tempId, result.id);
      await queueRemove(m.id);
      await refreshPending();
    }

    const collections = [...new Set(queue.map((m) => m.collection))];
    await Promise.all(collections.map(invalidate));
    emit({
      syncing: false,
      online: true,
      lastSync: Date.now(),
      // As recusas ficam visíveis: o cache otimista mostrava a alteração como
      // se tivesse sido aceite, e ninguém saberia que o servidor a recusou.
      rejected: [...state.rejected, ...rejeitadas],
      lastError: rejeitadas.length
        ? `${rejeitadas.length} alteração(ões) recusada(s) pelo servidor.`
        : null,
    });
    if (rejeitadas.length) await Promise.all(collections.map(invalidate));
  } catch (err) {
    emit({
      syncing: false,
      online: false,
      rejected: [...state.rejected, ...rejeitadas],
      lastError: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Limpa a lista de recusas depois de o utilizador as ver. */
export function clearRejected() {
  emit({ rejected: [] });
}

/* ── Arranque ── */

/**
 * Liga a sincronização automática. Chamado uma vez, no arranque da aplicação.
 *
 * Isto corria ao importar o módulo, e era um problema a dois níveis. O visível:
 * os testes ficaram intermitentes — cada `vi.resetModules()` deixava para trás
 * um `setInterval` e um `flush()` pendente de uma instância anterior, todos a
 * partilhar o mesmo IndexedDB, e uma execução antiga drenava a fila que o teste
 * seguinte estava a montar. Passava três vezes em quatro.
 *
 * O de fundo: importar um módulo não devia registar ouvintes globais nem
 * arrancar temporizadores. Quem importa `offline.ts` para usar `readThrough`
 * não está a pedir um motor de sincronização. Torná-lo explícito devolve o
 * controlo a quem chama — e devolve o encerramento, que antes não existia.
 */
export function iniciarSync(): () => void {
  const aoLigar = () => {
    emit({ online: true });
    flush();
  };
  const aoDesligar = () => emit({ online: false });

  window.addEventListener('online', aoLigar);
  window.addEventListener('offline', aoDesligar);

  refreshPending().then(() => {
    if (navigator.onLine) flush();
  });

  // Tentativa periódica: cobre o caso de o browser dizer "online" mas o servidor
  // estar em baixo (navigator.onLine só vê a interface de rede, não o servidor).
  const temporizador = setInterval(() => {
    if (state.pending > 0) flush();
  }, 20000);

  return () => {
    window.removeEventListener('online', aoLigar);
    window.removeEventListener('offline', aoDesligar);
    clearInterval(temporizador);
  };
}
