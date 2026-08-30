// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { verifySession, setSession, getToken, type AuthUser } from './auth';

/**
 * Política de sessão.
 *
 * O que se prova aqui é a distinção entre "esta sessão não vale" e "o servidor
 * está com problemas". `verifySession` fazia `if (!res.ok) clearSession()`, ou
 * seja, apagava a sessão em QUALQUER erro — 429 por excesso de pedidos, 500,
 * 503 durante um reinício.
 *
 * O efeito era o utilizador ser atirado para o ecrã de entrada num pico de
 * tráfego, com o que estivesse a escrever por gravar. Apareceu primeiro na
 * suite E2E, que atinge o limite de 300 pedidos/minuto e via a aplicação
 * fazer logout a meio.
 */

const UTILIZADOR: AuthUser = {
  id: 'u1',
  email: 'pessoa@exemplo.pt',
  name: 'Pessoa',
  role: 'admin',
};

const resposta = (status: number, corpo: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => corpo,
});

beforeEach(() => {
  localStorage.clear();
  setSession('token-valido', UTILIZADOR);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifySession', () => {
  it('devolve o utilizador que o servidor confirma', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(resposta(200, { user: { ...UTILIZADOR, name: 'Atualizado' } })),
    );

    const u = await verifySession();
    expect(u?.name).toBe('Atualizado');
    expect(getToken()).toBe('token-valido');
  });

  it('apaga a sessão quando o servidor a recusa (401)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(401, { error: 'expirada' })));

    expect(await verifySession()).toBeNull();
    expect(getToken()).toBeNull();
  });

  it('apaga a sessão em 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(403, { error: 'sem permissão' })));

    expect(await verifySession()).toBeNull();
    expect(getToken()).toBeNull();
  });

  /* ── O que a correção protege ── */

  it('NÃO expulsa o utilizador quando o servidor limita o tráfego (429)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(429, { error: 'demasiados' })));

    const u = await verifySession();
    expect(u?.email).toBe(UTILIZADOR.email);
    expect(getToken()).toBe('token-valido');
  });

  it('NÃO expulsa o utilizador quando o servidor falha (500)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(500, { error: 'interno' })));

    const u = await verifySession();
    expect(u?.email).toBe(UTILIZADOR.email);
    expect(getToken()).toBe('token-valido');
  });

  it('NÃO expulsa o utilizador enquanto o servidor reinicia (503)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(503, { status: 'degraded' })));

    const u = await verifySession();
    expect(u?.email).toBe(UTILIZADOR.email);
    expect(getToken()).toBe('token-valido');
  });

  it('mantém a sessão local quando não há rede nenhuma', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const u = await verifySession();
    expect(u?.email).toBe(UTILIZADOR.email);
    expect(getToken()).toBe('token-valido');
  });

  it('sem token não chega a perguntar ao servidor', async () => {
    localStorage.clear();
    const espia = vi.fn();
    vi.stubGlobal('fetch', espia);

    expect(await verifySession()).toBeNull();
    expect(espia).not.toHaveBeenCalled();
  });
});
