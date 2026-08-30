// PRIMEIRO import, sempre: carrega .env.local antes de qualquer módulo que
// leia process.env. Tem de ser um import (e não código no corpo deste
// ficheiro) porque os módulos ESM são todos avaliados antes da primeira linha
// executável daqui — ver o comentário em env.ts.
import './env.js';

import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { log } from './logger.js';
import { db } from './db.js';
import { runMigrations } from './migrations.js';
import { envolverAsync } from './asyncRouter.js';
import { initAuthSchema, authRouter, requireAuth, requireRole } from './auth.js';
import { clientsRouter } from './routes/clients.js';
import { activitiesRouter } from './routes/activities.js';
import { interlocutorsRouter } from './routes/interlocutors.js';
import { dealsRouter } from './routes/deals.js';
import { agendaRouter } from './routes/agenda.js';
import { teamRouter } from './routes/team.js';
import { iaRouter } from './routes/ia.js';
import { insightsRouter } from './routes/insights.js';
import { seedRouter } from './seed.js';
import type { LinhaBD } from './linhas.js';

const app = express();
const PORT = process.env.PORT || 3001;

/* ── Confiança no proxy ──
   `req.ip` é a chave do rate limiting. Atrás de um balanceador (Vercel, Nginx)
   todos os pedidos chegam com o IP do proxy: sem isto, TODOS os
   utilizadores partilhariam o mesmo balde de 10 logins/15min e bastavam 10
   pedidos para trancar o login de toda a gente.
   O valor é o número de hops até ao cliente e tem de ser explícito: confiar
   cegamente em X-Forwarded-For deixaria qualquer um forjar o IP e tornaria o
   limite inútil. Por omissão 0 = sem proxy (desenvolvimento). */
const PROXY_HOPS = Number(process.env.TRUST_PROXY_HOPS) || 0;
if (PROXY_HOPS > 0) app.set('trust proxy', PROXY_HOPS);

const SERVE_FRONTEND = existsSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'public'));

app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: SERVE_FRONTEND
      ? {
          directives: {
            defaultSrc: ["'self'"],
            // O bundle do Vite não usa scripts inline nem eval.
            scriptSrc: ["'self'"],
            // O Leaflet injeta estilos em runtime; sem isto o mapa fica sem CSS.
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            // Tiles do OpenStreetMap e ícones embutidos como data:
            imgSrc: ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: [],
          },
        }
      : false,
  }),
);

/* ── CORS ──
   Antes aceitava qualquer origem, o que permitia a qualquer site fazer pedidos
   autenticados em nome do utilizador. Passa a haver lista branca, configurável
   por CORS_ORIGINS (separado por vírgulas) para o ambiente de produção. */
const ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // Sem Origin = pedido do próprio servidor ou de ferramenta CLI (curl, testes).
      if (!origin || ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error(`Origem não autorizada: ${origin}`));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: '1mb' }));

/* ── Logging estruturado ──
   Cada pedido leva um id próprio, para que as linhas de um mesmo pedido possam
   ser reunidas quando algo corre mal. */
app.use(
  pinoHttp({
    logger: log,
    genReqId: (req) => (req.headers['x-request-id'] as string) || randomUUID(),
    customLogLevel: (_req, res, err) =>
      err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    // O corpo do pedido pode conter notas de clientes — não vai para o log.
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }),
);

/* ── Limites de tráfego ──
   O login é o alvo óbvio de força bruta; a IA é o endpoint caro.
   Os limites são configuráveis porque a suite de testes faz dezenas de logins
   legítimos — e desligar o limitador em testes deixaria de o testar. */
const LOGIN_LIMIT = Number(process.env.LOGIN_RATE_LIMIT) || 10;

app.use(
  '/api/auth/login',
  rateLimit({
    windowMs: 15 * 60_000,
    limit: LOGIN_LIMIT,
    message: { error: 'Demasiadas tentativas. Tenta daqui a 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

/**
 * Health check.
 *
 * Um `{status:'ok'}` fixo mente: responde 200 mesmo com a base de dados em
 * baixo, e um balanceador continuaria a mandar tráfego para um processo
 * inútil. Aqui toca-se mesmo na base — se ela falhar, isto devolve 503.
 */
async function estadoDaBase() {
  const inicio = Date.now();
  await db.execute('SELECT 1');
  return Date.now() - inicio;
}

// Público: só o suficiente para um balanceador decidir. Uptime e latência são
// metadados de infraestrutura e ficam atrás de autenticação — dá-los a quem
// passa por ali só ajuda a fazer fingerprinting do serviço.
app.get(
  '/health',
  envolverAsync(async (_req, res) => {
    try {
      await estadoDaBase();
      res.json({ status: 'ok' });
    } catch (err) {
      log.error({ err }, 'health check falhou');
      res.status(503).json({ status: 'degraded' });
    }
  }),
);

// Login é o único endpoint público
app.use('/api', authRouter);

/* Tudo o resto exige sessão válida.
   `envolverAsync` porque isto é montado diretamente no `app`, fora do
   `asyncRouter`: o `requireAuth` passou a ler a base de dados (para verificar
   se a sessão foi revogada) e, sem o embrulho, uma falha dessa leitura ficava
   por apanhar — o pedido pendurava-se em vez de devolver 500. É exatamente o
   defeito que o asyncRouter existe para fechar, e escapou por esta rota não
   passar por ele. */
app.use('/api', envolverAsync(requireAuth));

/* ── Limite da IA, por utilizador ──
   Fica DEPOIS do requireAuth de propósito: só aqui existe `req.user`. Por IP,
   um escritório inteiro atrás do mesmo NAT partilhava o balde, e uma única
   conta abusiva esgotava a quota (e a fatura) de toda a gente. */
app.use(
  '/api/ia-',
  rateLimit({
    windowMs: 60_000,
    limit: Number(process.env.IA_RATE_LIMIT) || 20,
    message: { error: 'Demasiados pedidos à IA. Aguarda um momento.' },
    // Autenticado: chave é o utilizador. Sem sessão (não devia acontecer aqui),
    // cai no IP — passado pelo `ipKeyGenerator`, que agrupa endereços IPv6 pelo
    // prefixo /64. Sem ele, cada pedido de um cliente IPv6 podia vir de um
    // endereço diferente da mesma máquina e o limite não contava nada.
    keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

/** Diagnóstico detalhado — para quem opera o serviço, não para o público. */
app.get(
  '/api/health',
  requireRole('admin'),
  envolverAsync(async (_req, res) => {
    try {
      const latencyMs = await estadoDaBase();
      res.json({
        status: 'ok',
        db: 'ok',
        latencyMs,
        uptimeSec: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      log.error({ err }, 'diagnóstico falhou');
      res.status(503).json({ status: 'degraded', db: 'erro' });
    }
  }),
);
/* A ORDEM IMPORTA. O `insightsRouter` define caminhos literais que colidem com
   o parâmetro `/clients/:id` do `clientsRouter` — `/clients/summary` tem o
   mesmo número de segmentos e seria capturado como se `summary` fosse um id.
   Literais primeiro, parâmetros depois. */
app.use('/api', insightsRouter);
app.use('/api', clientsRouter);
app.use('/api', activitiesRouter);
app.use('/api', interlocutorsRouter);
app.use('/api', dealsRouter);
app.use('/api', agendaRouter);
app.use('/api', teamRouter);
app.use('/api', iaRouter);
// O seed reescreve a base inteira — nunca deve estar ao alcance de um utilizador comum.
app.use('/api', requireRole('admin'), seedRouter);

/* ── Frontend em produção ──
   Em desenvolvimento é o Vite que serve o frontend; em produção o bundle vem
   em ./public e é servido por este mesmo processo, para haver um só sítio a
   responder e nenhuma questão de CORS entre origens. */
const PUBLICO = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
if (existsSync(PUBLICO)) {
  // Os ficheiros com hash no nome podem ser guardados para sempre; o index.html
  // nunca, senão o browser fica preso a uma versão antiga da aplicação.
  app.use(
    express.static(PUBLICO, {
      maxAge: '1y',
      setHeaders: (res, caminho) => {
        if (caminho.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );

  // Aplicação de página única: qualquer rota que não seja da API devolve o
  // index.html, para que abrir /clientes diretamente funcione.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(join(PUBLICO, 'index.html'));
  });
}

/**
 * Rota da API que não existe devolve JSON, não a página de erro do Express.
 *
 * Sem isto, um caminho errado sob `/api` caía no handler por omissão e
 * respondia `<!DOCTYPE html>` — o que faz `response.json()` rebentar do lado
 * de quem chama, com uma mensagem que não ajuda em nada.
 *
 * Fica depois de todos os routers e antes do handler de erro.
 */
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
});

/** Rede de segurança: um erro não tratado devolve JSON, não uma stack HTML. */
app.use(
  (err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // O id do pedido vai na resposta para que o utilizador possa citá-lo ao
    // reportar o problema, e a linha de log correspondente seja encontrada.
    const reqId = (req as LinhaBD).id;

    const mensagem = err instanceof Error ? err.message : String(err);

    if (/Origem não autorizada/.test(mensagem)) {
      log.warn({ reqId, origin: req.headers.origin }, 'origem bloqueada por CORS');
      return res.status(403).json({ error: 'Origem não autorizada.', reqId });
    }

    // Corpo que não é JSON válido é culpa de quem pediu, não do servidor.
    // Devolver 500 aqui escondia um erro de cliente atrás de um erro nosso.
    if (err instanceof SyntaxError && 'body' in err) {
      log.warn({ reqId }, 'corpo do pedido não é JSON válido');
      return res.status(400).json({ error: 'Corpo do pedido não é JSON válido.', reqId });
    }

    // Corpo acima do limite configurado em express.json().
    if ((err as LinhaBD)?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Corpo do pedido demasiado grande.', reqId });
    }

    log.error({ err, reqId, url: req.url }, 'erro não tratado');
    res.status(500).json({ error: 'Erro interno do servidor.', reqId });
  },
);

export { app };

/**
 * Migrações e conta admin.
 *
 * Corre sempre, incluindo em serverless (Vercel): sem processo de arranque
 * próprio, é a primeira invocação fria que tem de garantir que o esquema
 * existe. Quem embrulha `app` numa função espera por isto antes de despachar o
 * pedido — sem esperar, o primeiro pedido de cada arranque frio corria contra
 * uma base ainda a meio de migrar.
 *
 * Uma promessa guardada numa constante não serve aqui: se falhar — uma falha
 * de rede momentânea contra a base remota chega — fica rejeitada para sempre, e
 * todos os pedidos seguintes nessa instância herdam a rejeição. O utilizador
 * via o site em baixo até a plataforma reciclar a instância.
 *
 * Guarda-se só o sucesso. Em caso de falha, o pedido seguinte volta a tentar.
 */
let arranque: Promise<void> | null = null;

export function garantirPronta(): Promise<void> {
  if (process.env.NODE_ENV === 'test') return Promise.resolve();
  if (!arranque) {
    arranque = runMigrations()
      .then(initAuthSchema)
      .catch((err) => {
        arranque = null;
        log.error({ err }, 'arranque falhou; o próximo pedido volta a tentar');
        throw err;
      });
  }
  return arranque;
}

/** Só arranca o servidor com socket próprio fora de serverless (os testes importam `app`). */
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  garantirPronta()
    .then(() => {
      app.listen(PORT, () => {
        log.info({ port: PORT, origins: ORIGINS }, 'servidor a ouvir');
      });
    })
    .catch((err) => {
      log.fatal({ err }, 'falha ao inicializar');
      process.exit(1);
    });
}
