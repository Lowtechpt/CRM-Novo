// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Testes da camada offline — o coração do produto, que até aqui não tinha
 * nenhum.
 *
 * O que se prova aqui é a política de erros, que estava errada de duas formas:
 *
 * 1. `writeThrough` fazia `catch` genérico, por isso um 400 de validação
 *    obtido COM rede entrava na fila como se fosse falta de ligação. O
 *    utilizador via "1 por sincronizar" para sempre, com a alteração já
 *    recusada pelo servidor.
 * 2. `flush` parava no primeiro erro. Uma mutação inválida à cabeça bloqueava
 *    todas as seguintes — as visitas e notas registadas depois ficavam presas
 *    atrás dela. Era exatamente o cenário "visita que não sincronizou" que
 *    este CRM diz resolver.
 */

/** Resposta HTTP simulada. */
const resposta = (status: number, corpo: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => corpo,
});

const ok = (corpo: unknown = { id: 'real-1' }) => resposta(200, corpo);
const criado = (id = 'real-1') => resposta(200, { id });
const invalido = () => resposta(400, { error: 'Dados inválidos.' });
const semRede = () => Promise.reject(new TypeError('Failed to fetch'));

/** Importa o módulo de raiz — o estado interno é de módulo. */
async function carregar() {
  vi.resetModules();
  return import('./offline');
}

/**
 * O IndexedDB falso é global e sobrevive entre testes: sem isto, a fila de um
 * teste aparecia no seguinte e as contagens não faziam sentido.
 */
// Esvaziar em vez de apagar: o módulo importado no teste anterior mantém a
// ligação aberta, e `deleteDatabase` fica bloqueado à espera que ela feche.
function apagarBaseLocal() {
  return new Promise<void>((resolve) => {
    const pedido = indexedDB.open('crm-offline', 1);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id' });
    };
    pedido.onsuccess = () => {
      const db = pedido.result;
      const t = db.transaction(['cache', 'queue'], 'readwrite');
      t.objectStore('cache').clear();
      t.objectStore('queue').clear();
      const fechar = () => {
        db.close();
        resolve();
      };
      t.oncomplete = fechar;
      t.onerror = fechar;
    };
    pedido.onerror = () => resolve();
  });
}

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem('crm_token', 'token-de-teste');
  vi.stubGlobal('fetch', vi.fn());
  await apagarBaseLocal();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('writeThrough: recusa do servidor não é falta de rede', () => {
  it('um 400 é lançado e NÃO entra na fila', async () => {
    const { writeThrough, queueAll } = await carregar();
    vi.mocked(fetch).mockResolvedValue(invalido() as unknown as Response);

    await expect(writeThrough('POST', '/clients', '/clients', { name: '' })).rejects.toThrow(
      /inválidos/i,
    );

    expect(await queueAll()).toHaveLength(0);
  });

  it('uma falha de rede ENTRA na fila', async () => {
    const { writeThrough, queueAll } = await carregar();
    vi.mocked(fetch).mockImplementation(semRede as never);

    await writeThrough('POST', '/clients', '/clients', { name: 'Sem rede' });

    const fila = await queueAll();
    expect(fila).toHaveLength(1);
    expect(fila[0].method).toBe('POST');
  });

  it('um 500 ENTRA na fila — repetir faz sentido', async () => {
    const { writeThrough, queueAll } = await carregar();
    vi.mocked(fetch).mockResolvedValue(resposta(503) as unknown as Response);

    await writeThrough('PUT', '/clients/1', '/clients', { name: 'x' });
    expect(await queueAll()).toHaveLength(1);
  });

  it('um 401 ENTRA na fila — vale a pena repetir depois do login', async () => {
    const { writeThrough, queueAll } = await carregar();
    vi.mocked(fetch).mockResolvedValue(
      resposta(401, { error: 'Autenticação necessária.' }) as never,
    );

    await writeThrough('POST', '/clients', '/clients', { name: 'x' });
    expect(await queueAll()).toHaveLength(1);
  });

  it('um 429 ENTRA na fila — é temporário apesar de ser 4xx', async () => {
    const { writeThrough, queueAll } = await carregar();
    vi.mocked(fetch).mockResolvedValue(resposta(429, { error: 'Devagar.' }) as never);

    await writeThrough('POST', '/clients', '/clients', { name: 'x' });
    expect(await queueAll()).toHaveLength(1);
  });
});

describe('flush: uma mutação recusada não bloqueia as seguintes', () => {
  it('drena as boas e descarta a má, em vez de parar', async () => {
    const { writeThrough, flush, queueAll } = await carregar();

    // Três mutações criadas sem rede.
    vi.mocked(fetch).mockImplementation(semRede as never);
    await writeThrough('POST', '/clients', '/clients', { name: 'Inválido' });
    await writeThrough('POST', '/clients', '/clients', { name: 'Bom 1' });
    await writeThrough('POST', '/clients', '/clients', { name: 'Bom 2' });
    expect(await queueAll()).toHaveLength(3);

    // Volta a rede: a primeira é recusada, as outras passam.
    let chamada = 0;
    vi.mocked(fetch).mockImplementation((async () => {
      chamada++;
      if (chamada === 1) return invalido();
      return criado(`real-${chamada}`);
    }) as never);

    await flush();

    // Antes da correção, a fila ficava com 3 para sempre.
    expect(await queueAll()).toHaveLength(0);
  });

  it('regista as recusadas para a UI as poder mostrar', async () => {
    const { writeThrough, flush, subscribe } = await carregar();

    vi.mocked(fetch).mockImplementation(semRede as never);
    await writeThrough('PUT', '/clients/1', '/clients', { name: '' });

    vi.mocked(fetch).mockResolvedValue(invalido() as unknown as Response);
    await flush();

    let estado: { rejected: unknown[] } | null = null;
    subscribe((s) => {
      estado = s as never;
    });

    expect(estado!.rejected).toHaveLength(1);
  });

  it('uma falha de rede PARA a drenagem e mantém a ordem', async () => {
    // Aqui parar é o comportamento certo: a ordem causal importa (criar antes
    // de editar o mesmo registo) e repetir vai funcionar.
    const { writeThrough, flush, queueAll } = await carregar();

    vi.mocked(fetch).mockImplementation(semRede as never);
    await writeThrough('POST', '/clients', '/clients', { name: 'A' });
    await writeThrough('POST', '/clients', '/clients', { name: 'B' });

    let chamada = 0;
    vi.mocked(fetch).mockImplementation((async () => {
      chamada++;
      if (chamada === 1) return criado('real-1');
      throw new TypeError('Failed to fetch');
    }) as never);

    await flush();

    // A primeira passou; a segunda continua à espera.
    expect(await queueAll()).toHaveLength(1);
  });

  it('reescreve o id temporário no CORPO de mutações dependentes', async () => {
    /**
     * O caso que se perdia: criar um cliente offline e, a seguir, um negócio
     * para esse cliente. O `clientId` no corpo continuava `tmp_...`, o servidor
     * rejeitava a chave estrangeira com 400, e a mutação era descartada como
     * recusada — o negócio desaparecia sem deixar rasto.
     */
    const { writeThrough, flush } = await carregar();

    vi.mocked(fetch).mockImplementation(semRede as never);
    const cliente = await writeThrough<{ id: string }>('POST', '/clients', '/clients', {
      name: 'Criado no terreno',
    });
    await writeThrough('POST', '/deals', '/deals', {
      clientId: cliente.id,
      title: 'Venda 50k',
    });

    const corpos: any[] = [];
    let n = 0;
    vi.mocked(fetch).mockImplementation((async (_url: string, init: any) => {
      corpos.push(JSON.parse(init.body));
      return criado(`real-${++n}`);
    }) as never);

    await flush();

    expect(corpos[1].clientId).toBe('real-1');
    expect(corpos[1].clientId).not.toMatch(/^tmp_/);
  });

  it('reescreve ids temporários aninhados em qualquer profundidade', async () => {
    // A substituição percorre a estrutura toda: uma referência nova
    // acrescentada mais tarde escaparia a uma lista fixa de campos.
    const { writeThrough, flush } = await carregar();

    vi.mocked(fetch).mockImplementation(semRede as never);
    const cliente = await writeThrough<{ id: string }>('POST', '/clients', '/clients', {
      name: 'X',
    });
    await writeThrough('POST', '/competition', '/competition', {
      competitor: 'Rival',
      meta: { origem: { clientId: cliente.id } },
      relacionados: [{ clientId: cliente.id }],
    });

    const corpos: any[] = [];
    let n = 0;
    vi.mocked(fetch).mockImplementation((async (_url: string, init: any) => {
      corpos.push(JSON.parse(init.body));
      return criado(`real-${++n}`);
    }) as never);

    await flush();

    expect(corpos[1].meta.origem.clientId).toBe('real-1');
    expect(corpos[1].relacionados[0].clientId).toBe('real-1');
  });

  it('reescreve ids temporários no caminho de mutações posteriores', async () => {
    const { writeThrough, flush } = await carregar();

    vi.mocked(fetch).mockImplementation(semRede as never);
    const novo = await writeThrough<{ id: string }>('POST', '/clients', '/clients', {
      name: 'Criado offline',
    });
    expect(novo.id).toMatch(/^tmp_/);
    await writeThrough('PUT', `/clients/${novo.id}`, '/clients', { name: 'Editado' });

    const caminhos: string[] = [];
    vi.mocked(fetch).mockImplementation((async (url: string) => {
      caminhos.push(url);
      return criado('id-real-do-servidor');
    }) as never);

    await flush();

    // Sem a reescrita, o PUT ia para /clients/tmp_... e dava 404.
    expect(caminhos[1]).toContain('id-real-do-servidor');
    expect(caminhos[1]).not.toContain('tmp_');
  });
});

describe('readThrough: cache só quando falta rede', () => {
  it('serve o cache quando a rede falha', async () => {
    const { readThrough } = await carregar();

    vi.mocked(fetch).mockResolvedValue(ok([{ id: '1', name: 'Do servidor' }]) as never);
    await readThrough('/clients');

    vi.mocked(fetch).mockImplementation(semRede as never);
    const emCache = await readThrough<{ name: string }[]>('/clients');

    expect(emCache[0].name).toBe('Do servidor');
  });

  it('NÃO serve o cache quando o servidor recusa', async () => {
    // Servir cache num 403 mostrava dados a que o utilizador já não tem
    // acesso, e marcava a app como "sem ligação" estando ela ligada.
    const { readThrough } = await carregar();

    vi.mocked(fetch).mockResolvedValue(ok([{ id: '1', name: 'Antigo' }]) as never);
    await readThrough('/clients');

    vi.mocked(fetch).mockResolvedValue(resposta(403, { error: 'Sem permissão.' }) as never);

    await expect(readThrough('/clients')).rejects.toThrow(/permissão/i);
  });
});

describe('ErroApi: o que vale a pena repetir', () => {
  it.each([
    [400, true],
    [403, true],
    [404, true],
    [422, true],
    [401, false],
    [408, false],
    [429, false],
    [500, false],
    [503, false],
  ])('status %i -> definitivo=%s', async (status, esperado) => {
    const { ErroApi } = await carregar();
    expect(new ErroApi('x', status).definitivo).toBe(esperado);
  });
});
