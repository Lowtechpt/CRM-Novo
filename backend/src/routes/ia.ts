import { buildGlobalContext, buildClientContext } from '../iaContext.js';
import { validate, iaChatSchema, iaNewsSchema, iaEmailSchema } from '../validate.js';
import { log } from '../logger.js';
import { asyncRouter } from '../asyncRouter.js';
import type { LinhaBD } from '../linhas.js';

export const iaRouter = asyncRouter();

/**
 * Assistente IA via Kilo Gateway — o mesmo fornecedor e modelo usados no
 * projeto Gestao-Comercial (api/kilo-chat.js).
 *
 * Chave em backend/.env.local (KILO_API_KEY), nunca em .env.example.
 */

const KILO_ENDPOINT = 'https://api.kilo.ai/api/gateway/chat/completions';
// Tier gratuito com auto-routing. O `step-3.5-flash` do projeto de referência
// exige créditos na conta; sobrepor com KILO_MODEL se houver saldo.
const KILO_MODEL = process.env.KILO_MODEL || 'kilo-auto/free';

type Msg = { role: string; content: string };

/* ── Resiliência da chamada externa ──
   Um serviço de terceiros pode ficar lento, falhar de forma intermitente ou
   simplesmente não responder. Sem defesa, um pedido à IA prendia a ligação
   indefinidamente e o utilizador ficava com o ecrã bloqueado sem explicação. */

const TIMEOUT_MS = Number(process.env.KILO_TIMEOUT_MS) || 45_000;
const TENTATIVAS = Number(process.env.KILO_RETRIES) || 2;

/** Erros que vale a pena repetir: falha de rede ou avaria temporária do lado deles. */
function vaiPassar(status: number | null): boolean {
  if (status === null) return true; // rede caiu / timeout
  if (status === 429) return true; // limite de tráfego deles
  return status >= 500; // avaria do servidor
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Chamada ao gateway com timeout e repetição.
 *
 * Repete apenas o que faz sentido repetir: uma chave inválida ou um pedido
 * malformado (4xx) falham na mesma à segunda tentativa e só atrasariam a
 * resposta de erro. O intervalo cresce entre tentativas para não agravar um
 * serviço já em dificuldades.
 */
export async function kiloChat(messages: Msg[]): Promise<string> {
  const apiKey = process.env.KILO_API_KEY;
  if (!apiKey) throw new Error('KILO_API_KEY não configurada em backend/.env.local');

  let ultimoErro: Error = new Error('Falha desconhecida ao contactar a IA.');

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const cancelar = AbortSignal.timeout(TIMEOUT_MS);
    let status: number | null = null;

    try {
      const upstream = await fetch(KILO_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: KILO_MODEL, messages }),
        signal: cancelar,
      });
      status = upstream.status;

      const data = (await upstream.json().catch(() => ({}))) as LinhaBD;
      if (upstream.ok) return data?.choices?.[0]?.message?.content || '';

      ultimoErro = new Error(
        data?.error?.message || data?.error || `Kilo Gateway HTTP ${upstream.status}`,
      );
    } catch (err: unknown) {
      // AbortSignal.timeout rejeita com um TimeoutError — vale a pena
      // distingui-lo, porque a mensagem útil é outra.
      const eTimeout = err instanceof Error && err.name === 'TimeoutError';
      ultimoErro = eTimeout
        ? new Error(`A IA não respondeu em ${Math.round(TIMEOUT_MS / 1000)}s.`)
        : err instanceof Error
          ? err
          : new Error(String(err));
    }

    if (tentativa === TENTATIVAS || !vaiPassar(status)) break;
    log.warn({ tentativa, status, erro: ultimoErro.message }, 'IA falhou; a repetir');
    await espera(500 * tentativa);
  }

  throw ultimoErro;
}

const BASE_SYSTEM =
  'És um assistente de vendas B2B a ajudar um comercial a gerir a carteira de ' +
  'clientes num CRM. Responde em português de Portugal, direto e prático. ' +
  'Não inventes dados fora do que está no contexto. Quando a pergunta pedir ' +
  'uma lista, comparação ou ranking, apresenta SEMPRE também uma tabela em ' +
  'markdown (formato | Coluna | Coluna |) além do texto.\n\n' +
  'Tens acesso aos dados completos do CRM abaixo: fichas de clientes, histórico ' +
  'de atividades com o texto das notas, negócios com valores e estágios, agenda, ' +
  'interlocutores e concorrência. Usa esse detalhe — cita atividades e negócios ' +
  'concretos quando forem relevantes. Não digas que te falta informação sem ' +
  'antes procurares nos dados fornecidos.';

/**
 * Chat do Assistente IA, do cliente e da Análise.
 *
 * O contexto é montado no servidor a partir da base de dados — atividades com
 * o texto das notas, negócios, agenda, interlocutores e concorrência. Antes
 * chegava só um resumo agregado do browser, e o modelo respondia que "não há
 * detalhe de atividades individuais por cliente no contexto fornecido".
 *
 * scope: 'global' (toda a carteira) | 'client' (uma ficha, exige clientId)
 */
iaRouter.post('/ia-chat', validate(iaChatSchema), async (req, res) => {
  const { messages, scope, clientId } = req.body as {
    messages?: Msg[];
    scope?: 'global' | 'client';
    clientId?: string;
  };

  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'Campo messages em falta.' });
  }

  try {
    /* ── O prompt de sistema é do servidor, ponto ──
       O corpo do pedido aceitava `system` e `context`, e o `system` do cliente
       SUBSTITUÍA o prompt base — incluindo a instrução que impede o modelo de
       citar dados internos do CRM nos emails que sugere. Qualquer conta podia
       remover essa proteção, ou usar o endpoint (e a chave paga) como modelo de
       linguagem pessoal, com 60 kB de contexto à escolha.
       Os campos continuam a ser aceites pelo schema para não partir clientes
       antigos, mas são ignorados. */
    const ctx =
      scope === 'client' && clientId
        ? await buildClientContext(clientId)
        : await buildGlobalContext();

    const reply = await kiloChat([
      {
        role: 'system',
        content: `${BASE_SYSTEM}\n\n=== DADOS DO CRM ===\n${ctx}`.trim(),
      },
      ...messages,
    ]);
    res.json({ reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(msg.includes('não configurada') ? 503 : 502).json({ error: msg });
  }
});

/** Contexto em bruto — para ver exatamente o que a IA recebe. */
iaRouter.get('/ia-context', async (req, res) => {
  try {
    const clientId = req.query.clientId as string | undefined;
    const ctx = clientId ? await buildClientContext(clientId) : await buildGlobalContext();
    res.type('text/plain; charset=utf-8').send(ctx);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Notícias e sinais de mercado sobre um cliente.
 * O modelo não navega — responde a partir do que sabe e é instruído a
 * assinalar quando não tem informação, em vez de inventar.
 */
iaRouter.post('/ia-news', validate(iaNewsSchema), async (req, res) => {
  const { name, sector, city } = req.body as { name?: string; sector?: string; city?: string };
  if (!name) return res.status(400).json({ error: 'name obrigatório' });

  try {
    const reply = await kiloChat([
      {
        role: 'system',
        content:
          'És um analista comercial. Em português de Portugal, resume o que ' +
          'sabes sobre a empresa indicada e o seu setor: contexto de mercado, ' +
          'possíveis necessidades e ganchos de abordagem comercial. ' +
          'Se não conheceres a empresa em concreto, diz isso de forma clara na ' +
          'primeira linha e passa a analisar apenas o setor. Nunca inventes ' +
          'factos, números ou notícias.',
      },
      {
        role: 'user',
        content: `Empresa: ${name}\nSetor: ${sector || 'n/d'}\nLocalidade: ${city || 'n/d'}`,
      },
    ]);
    res.json({ reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(msg.includes('não configurada') ? 503 : 502).json({ error: msg });
  }
});

/** Sugestão de email comercial a partir do contexto do cliente. */
iaRouter.post('/ia-email', validate(iaEmailSchema), async (req, res) => {
  const { intent, clientId } = req.body as { intent?: string; clientId?: string };
  try {
    // O contexto vem da base de dados, não do pedido: era o browser a enviá-lo,
    // e quem enviava o contexto controlava o que o modelo via — incluindo poder
    // esvaziá-lo para contornar as regras deste prompt.
    const context = clientId ? await buildClientContext(clientId) : '';
    const reply = await kiloChat([
      {
        role: 'system',
        content:
          'Escreves emails comerciais em português de Portugal. Três parágrafos ' +
          'curtos, menos de 150 palavras, tom profissional e direto. Não finjas ' +
          'acompanhamento anterior que não exista no contexto. Termina com uma ' +
          'call-to-action de baixo atrito. Devolve assunto e corpo, separados ' +
          'por uma linha "---".\n\n' +
          'CRÍTICO: o contexto que recebes é informação INTERNA do CRM. NUNCA a ' +
          'menciones no email — nem valores de pipeline, nem scores, nem há ' +
          'quantos dias não há contacto, nem notas internas. O destinatário é o ' +
          'cliente e não pode saber que existem. Usa esses dados apenas para ' +
          'decidir o tom e o assunto.',
      },
      {
        role: 'user',
        content:
          `=== CONTEXTO INTERNO (não mencionar no email) ===\n${context}\n` +
          `=== FIM DO CONTEXTO ===\n\nObjetivo: ${intent || 'primeiro contacto'}`,
      },
    ]);
    res.json({ reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(msg.includes('não configurada') ? 503 : 502).json({ error: msg });
  }
});

/** Verificação rápida de configuração, para a UI saber se pode oferecer IA. */
iaRouter.get('/ia-status', (_req, res) => {
  res.json({
    configured: !!process.env.KILO_API_KEY,
    model: KILO_MODEL,
    provider: 'Kilo Gateway',
  });
});
