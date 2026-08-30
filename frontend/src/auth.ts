/**
 * Sessão do utilizador no browser.
 *
 * O token vai no cabeçalho Authorization de cada pedido (ver api.ts).
 * Guardado em localStorage: é um CRM interno, não uma app pública, e a
 * alternativa (cookie httpOnly) exigiria o backend e o frontend no mesmo
 * domínio, o que não acontece em desenvolvimento.
 */

const TOKEN_KEY = 'crm_token';
const USER_KEY = 'crm_user';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Não foi possível entrar.');
  setSession(data.token, data.user);
  return data.user;
}

/**
 * Confirma no arranque que o token ainda é aceite pelo servidor.
 *
 * Só um 401 ou 403 significam "esta sessão não vale": aí apaga-se. Qualquer
 * outra resposta — 429 por excesso de pedidos, 500, 503 enquanto o servidor
 * reinicia — é um problema temporário do servidor, não da sessão, e expulsar
 * o utilizador por causa dela custa-lhe o trabalho por gravar.
 *
 * Antes, `if (!res.ok)` apagava a sessão em qualquer erro. Foi apanhado pela
 * suite E2E, que atinge o limite de tráfego e via a aplicação saltar para o
 * ecrã de entrada a meio dos testes — o mesmo aconteceria a um utilizador num
 * pico de uso. É a distinção que `ErroApi.definitivo` já faz para a fila
 * offline, aplicada agora também aqui.
 */
export async function verifySession(): Promise<AuthUser | null> {
  if (!getToken()) return null;
  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.status === 401 || res.status === 403) {
      clearSession();
      return null;
    }
    if (!res.ok) return getUser();
    return (await res.json()).user;
  } catch {
    // Sem rede: mantém a sessão local para a app continuar a funcionar offline
    return getUser();
  }
}

/** Iniciais para o avatar do header. */
export function initialsOf(user: AuthUser | null) {
  if (!user?.name) return '··';
  return user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}
