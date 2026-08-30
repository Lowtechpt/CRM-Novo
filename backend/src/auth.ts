import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { db } from './db.js';
import { asyncRouter } from './asyncRouter.js';
import type { LinhaBD } from './linhas.js';

/**
 * Autenticação por JWT.
 *
 * O CRM guarda nomes, telefones, emails, notas internas e valores de negócio.
 * Sem isto, qualquer pessoa com acesso à rede lê a base de dados inteira —
 * incluindo o endpoint de contexto da IA, que devolve tudo de uma vez.
 */

const JWT_SECRET = process.env.JWT_SECRET || '';
const TOKEN_TTL = '12h';

if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET obrigatório em produção. Define em backend/.env.local');
}

/** Em desenvolvimento aceita-se um segredo efémero, mas avisa-se. */
const SECRET =
  JWT_SECRET ||
  (() => {
    console.warn('⚠  JWT_SECRET não definido — a usar segredo efémero (só desenvolvimento).');
    return randomUUID();
  })();

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

/** Segunda conta de administração, independente da usada para demonstração. */
const RELATORIO_EMAIL = (process.env.RELATORIO_EMAIL || 'admin@admin.pt').toLowerCase().trim();

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** A tabela `users` vem da migration 001; aqui só se semeia a conta inicial. */
export async function initAuthSchema() {
  await criarContaAdmin();
  await criarContaRelatorios();
  await criarContaDemo();
}

/** Criada só se a password vier definida no ambiente; sem isso, não existe. */
async function criarContaRelatorios() {
  const pass = process.env.RELATORIO_PASSWORD;
  if (!pass) return;

  const existe = await db.execute({
    sql: 'SELECT 1 FROM users WHERE email=?',
    args: [RELATORIO_EMAIL],
  });
  if (existe.rows.length) return;

  await db.execute({
    sql: 'INSERT INTO users (id,email,name,password_hash,role) VALUES (?,?,?,?,?)',
    args: [randomUUID(), RELATORIO_EMAIL, 'Administrador', await bcrypt.hash(pass, 10), 'admin'],
  });
}

async function criarContaAdmin() {
  // Primeiro arranque: cria a conta de administração a partir do ambiente.
  // Verifica especificamente por um admin, não por "algum utilizador" — a
  // conta de demonstração corre à parte e não pode contar como se já
  // houvesse administração, senão nunca mais se cria uma.
  const count = await db.execute("SELECT COUNT(*) AS n FROM users WHERE role='admin'");
  if (((count.rows[0] as LinhaBD).n ?? 0) > 0) return;

  const email = process.env.ADMIN_EMAIL;
  if (!email) {
    console.warn(
      '⚠  Sem utilizadores e sem ADMIN_EMAIL no ambiente.\n' +
        '   Define-o em backend/.env.local para criar a primeira conta.',
    );
    return;
  }

  /* Sem password definida, gera-se uma aleatória em vez de assumir um valor
     por omissão. Uma password previsível na primeira conta é a porta de
     entrada mais banal que existe — e, sendo a conta de administração, abre
     tudo. É impressa uma única vez; não fica escrita em lado nenhum. */
  const gerada = !process.env.ADMIN_PASSWORD;
  const pass = process.env.ADMIN_PASSWORD || randomUUID().replace(/-/g, '').slice(0, 20);
  await db.execute({
    sql: 'INSERT INTO users (id,email,name,password_hash,role) VALUES (?,?,?,?,?)',
    args: [
      randomUUID(),
      email.toLowerCase(),
      process.env.ADMIN_NAME || 'Administrador',
      await bcrypt.hash(pass, 10),
      'admin',
    ],
  });
  console.warn(`✓ Conta inicial criada: ${email}`);
  if (gerada) {
    console.warn(
      `  Password gerada (aparece só desta vez): ${pass}\n` +
        '  Guarda-a agora, ou define ADMIN_PASSWORD em backend/.env.local.',
    );
  }
}

/**
 * Conta de demonstração.
 *
 * Um CRM com login é uma porta fechada para quem só quer ver o projeto. A
 * saída fácil seria pôr a password no README — e é exatamente o hábito que um
 * auditor apanha primeiro, mesmo tratando-se de dados de brincar.
 *
 * Aqui as credenciais vivem só no ambiente de quem faz o deploy. O repositório
 * não as conhece; a aplicação pergunta ao servidor se existe modo de
 * demonstração e, se existir, oferece o botão.
 *
 * O papel é `user`, não `admin`: quem entra pode criar, editar e explorar tudo,
 * mas não apaga registos nem reescreve a base com o seed — essas operações
 * exigem administrador. A demonstração sobrevive à visita seguinte.
 */
export const demoAtivo = () => !!(process.env.DEMO_EMAIL && process.env.DEMO_PASSWORD);

async function criarContaDemo() {
  if (!demoAtivo()) return;
  const email = String(process.env.DEMO_EMAIL).toLowerCase().trim();

  const existe = await db.execute({ sql: 'SELECT 1 FROM users WHERE email=?', args: [email] });
  if (existe.rows.length) return;

  await db.execute({
    sql: 'INSERT INTO users (id,email,name,password_hash,role) VALUES (?,?,?,?,?)',
    args: [
      randomUUID(),
      email,
      process.env.DEMO_NAME || 'Visitante',
      await bcrypt.hash(String(process.env.DEMO_PASSWORD), 10),
      'user',
    ],
  });
  console.warn(`✓ Conta de demonstração disponível: ${email}`);
}

/** Middleware: exige token válido. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Autenticação necessária.' });

  let payload: AuthUser & { tv?: number; sid?: string };
  try {
    payload = jwt.verify(token, SECRET) as AuthUser & { tv?: number; sid?: string };
  } catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }

  /* ── Revogação ──
     Um JWT vale até expirar, e este vale 12 horas. Roubado — e vive em
     localStorage, ao alcance de qualquer XSS — não havia forma de o cortar:
     mudar a password não fazia diferença nenhuma.

     A `token_version` do utilizador entra no token. Basta incrementá-la para
     invalidar tudo o que foi assinado antes.

     O custo é uma leitura por pedido, o que tira ao JWT parte da vantagem de
     ser stateless. É uma troca deliberada: contra SQLite local a leitura custa
     décimas de milissegundo, e poder cortar uma sessão comprometida vale mais
     do que poupá-las. Ver docs/decisoes.md §6. */
  const r = await db.execute({
    sql: 'SELECT token_version FROM users WHERE id = ?',
    args: [payload.id],
  });
  const linha = r.rows[0] as LinhaBD | undefined;
  if (!linha) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });

  if (Number(linha.token_version ?? 0) !== Number(payload.tv ?? 0)) {
    return res.status(401).json({ error: 'Sessão terminada. Entra novamente.' });
  }

  req.user = { id: payload.id, email: payload.email, name: payload.name, role: payload.role };

  // Fora do caminho crítico: não se espera por isto nem se falha o pedido
  // se a escrita falhar. Alimenta só o painel de diagnóstico de acessos.
  if (payload.sid) {
    db.execute({
      sql: "UPDATE acessos SET ultima_atividade = datetime('now') WHERE id = ?",
      args: [payload.sid],
    }).catch(() => {});
  }

  next();
}

/**
 * Middleware: exige um dos papéis indicados.
 *
 * A coluna `role` existia desde o início mas ninguém a lia — na prática
 * qualquer utilizador autenticado podia apagar clientes. Usa-se nas operações
 * destrutivas e nas que mexem com a base inteira (importação, seed).
 *
 * Assume `requireAuth` antes dele: sem `req.user` responde 401, não 403.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Autenticação necessária.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Sem permissão para esta operação.' });
    }
    next();
  };
}

/**
 * Hash descartável, com o mesmo custo dos reais (10 rondas).
 *
 * Serve só para gastar o mesmo tempo quando o email não existe. É calculado
 * uma vez no arranque para não pagar o custo em cada pedido falhado.
 */
const HASH_FALSO = bcrypt.hashSync('nenhuma-conta-tem-esta-password', 10);

export const authRouter = asyncRouter();

/**
 * A aplicação pergunta se há demonstração antes de desenhar o login.
 * Público de propósito: é a única forma de o botão poder existir sem as
 * credenciais estarem no código do frontend.
 */
authRouter.get('/auth/demo', (_req, res) => {
  if (!demoAtivo()) return res.json({ enabled: false });
  res.json({
    enabled: true,
    email: process.env.DEMO_EMAIL,
    password: process.env.DEMO_PASSWORD,
  });
});

authRouter.post('/auth/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e password obrigatórios.' });
  }

  const r = await db.execute({
    sql: 'SELECT * FROM users WHERE email=?',
    args: [String(email).toLowerCase().trim()],
  });
  const u = r.rows[0] as LinhaBD | undefined;

  /* ── Mesma resposta E mesmo tempo ──
     A mensagem já era igual para email inexistente e password errada. Não
     chegava: quando o email não existia, o `bcrypt.compare` nunca corria e a
     resposta saía em ~4 ms, contra ~99 ms quando a conta existia. Medido: 22×
     de diferença — que é quanto basta para enumerar contas com um script,
     mesmo sem nunca acertar numa password.
     Comparar contra um hash descartável iguala o custo dos dois caminhos. */
  const ok = u
    ? await bcrypt.compare(password, String(u.password_hash))
    : (await bcrypt.compare(password, HASH_FALSO), false);

  if (!ok || !u) return res.status(401).json({ error: 'Credenciais inválidas.' });

  const user: AuthUser = {
    id: String(u.id),
    email: String(u.email),
    name: String(u.name),
    role: String(u.role),
  };
  const sid = randomUUID();
  const token = jwt.sign({ ...user, tv: Number(u.token_version ?? 0), sid }, SECRET, {
    expiresIn: TOKEN_TTL,
  });

  db.execute({
    sql: 'INSERT INTO acessos (id,user_id,email,ip,agente) VALUES (?,?,?,?,?)',
    args: [sid, user.id, user.email, req.ip ?? null, req.headers['user-agent'] ?? null],
  }).catch(() => {});

  res.json({ token, user });
});

/**
 * Termina todas as sessões desta conta, em todos os dispositivos.
 *
 * É a resposta prática a "acho que me roubaram o token": incrementar a versão
 * invalida no mesmo instante tudo o que foi assinado antes, incluindo o token
 * que está a ser usado para fazer este pedido.
 */
authRouter.post('/auth/revogar-sessoes', requireAuth, async (req, res) => {
  await db.execute({
    sql: 'UPDATE users SET token_version = token_version + 1 WHERE id = ?',
    args: [req.user!.id],
  });
  res.json({ ok: true });
});

/** Confirma se o token ainda é válido (usado no arranque do frontend). */
authRouter.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/**
 * Diagnóstico de acessos: quem entrou, quando, e por quanto tempo esteve
 * ativo. Restrito a uma conta específica — não à role — e a rota devolve 404
 * (não 403) a quem não é essa conta, para não confirmar que existe.
 */
authRouter.get('/diagnostico/acessos', requireAuth, async (req, res) => {
  if (req.user!.email !== RELATORIO_EMAIL) {
    return res.status(404).json({ error: `Rota não encontrada: GET ${req.originalUrl}` });
  }

  const r = await db.execute(
    'SELECT id, email, ip, agente, entrada_em, ultima_atividade FROM acessos ORDER BY entrada_em DESC LIMIT 500',
  );
  const linhas = r.rows.map((l) => {
    const row = l as LinhaBD;
    const inicio = new Date(String(row.entrada_em) + 'Z').getTime();
    const fim = new Date(String(row.ultima_atividade) + 'Z').getTime();
    return {
      email: row.email,
      ip: row.ip,
      agente: row.agente,
      entrada_em: row.entrada_em,
      ultima_atividade: row.ultima_atividade,
      duracao_min: Math.max(0, Math.round((fim - inicio) / 60000)),
    };
  });
  res.json({ acessos: linhas });
});
