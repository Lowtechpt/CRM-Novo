import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

/**
 * Validação de entrada. O backend deixava passar qualquer corpo de pedido —
 * um `score` podia vir como texto, um `email` como objeto, e ia direto para SQL.
 */

/** Middleware que valida `req.body` e substitui-o pelo valor já convertido. */
export function validate(schema: z.ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      return res.status(400).json({
        error: 'Dados inválidos.',
        details: r.error.issues.map((i) => ({
          campo: i.path.join('.') || '(raiz)',
          problema: i.message,
        })),
      });
    }
    req.body = r.data;
    next();
  };
}

/**
 * Campo de texto opcional.
 *
 * Aceita `null` de propósito: um campo vazio volta da base de dados como
 * `null`, e a app reenvia o registo inteiro ao gravar (`{...cliente, ...patch}`).
 * Sem isto, editar um cliente que tivesse *qualquer* campo opcional por
 * preencher respondia 400 — e a edição inline ficava impossível justamente
 * nos registos mais incompletos.
 *
 * `null` e `''` são normalizados para `undefined`, que é o que as rotas
 * convertem de volta em NULL na coluna.
 */
const optionalText = (max = 500) =>
  z.preprocess(
    (v) => (v === null || v === '' ? undefined : v),
    z.string().trim().max(max).optional(),
  );

export const CLIENT_STATUSES = ['Prospeto', 'Contactado', 'Ativo', 'Inativo'] as const;
export const CALL_STATES = ['', 'no-answer', 'vacation'] as const;

export const clientSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório').max(200),
  nif: optionalText(20),
  sector: optionalText(120),
  cae: optionalText(20),
  status: z.preprocess(
    (v) => (v === null || v === '' ? undefined : v),
    z.enum(CLIENT_STATUSES).default('Prospeto'),
  ),
  contact: optionalText(120),
  score: z.preprocess(
    (v) => (v === null || v === '' ? undefined : v),
    z.coerce.number().int().min(0).max(100).default(50),
  ),
  email: z.preprocess(
    (v) => (v === null || v === '' ? undefined : v),
    z.string().trim().email('Email inválido').max(200).optional(),
  ),
  phone: optionalText(40),
  website: optionalText(200),
  address: optionalText(300),
  city: optionalText(120),
  notes: optionalText(5000),
  lat: z.coerce.number().min(-90).max(90).optional().nullable(),
  lng: z.coerce.number().min(-180).max(180).optional().nullable(),
  starred: z.coerce.boolean().optional(),
  callState: z.enum(CALL_STATES).optional(),
  salespersonId: optionalText(64),
  parentId: optionalText(64),
});

export const ACTIVITY_TYPES = [
  'Telefonema',
  'Email',
  'Reunião',
  'Porta Fria',
  'Proposta',
  'Nota',
] as const;

export const activitySchema = z.object({
  type: z.enum(ACTIVITY_TYPES).default('Nota'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve ser AAAA-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Hora deve ser HH:MM'),
  notes: z.string().trim().max(5000).default(''),
  spokeTo: optionalText(120),
});

export const DEAL_STAGES = [
  'Prospeto',
  'Contactado',
  'Proposta',
  'Negociação',
  'Ganho',
  'Perdido',
  'Onboarding',
  'Em serviço',
  'Renovação',
] as const;

export const dealSchema = z.object({
  clientId: z.string().trim().min(1, 'Cliente é obrigatório'),
  title: z.string().trim().min(1, 'Título é obrigatório').max(200),
  value: z.coerce.number().min(0).max(1e9).default(0),
  stage: z.enum(DEAL_STAGES).default('Prospeto'),
  probability: z.coerce.number().int().min(0).max(100).default(20),
  // `null` vem da base quando o campo está vazio, e a app reenvia o registo
  // inteiro ao gravar — sem isto, mover um negócio sem prazo dava 400.
  dueDate: z.preprocess(
    (v) => (v === null || v === '' ? undefined : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve ser AAAA-MM-DD')
      .optional(),
  ),
  recurringValue: z.preprocess(
    (v) => (v === null || v === '' ? undefined : v),
    z.coerce.number().min(0).max(1e9).optional(),
  ),
});

export const AGENDA_TYPES = ['Reunião', 'Demo', 'Follow-up', 'Telefonema', 'Outro'] as const;

export const agendaSchema = z.object({
  clientId: optionalText(64),
  type: z.enum(AGENDA_TYPES).default('Reunião'),
  title: z.string().trim().min(1, 'Título é obrigatório').max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve ser AAAA-MM-DD'),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default('09:00'),
  done: z.coerce.boolean().default(false),
});

export const interlocutorSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório').max(160),
  role: optionalText(120),
  phone: optionalText(40),
  email: z
    .string()
    .trim()
    .email('Email inválido')
    .max(200)
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
});

export const COMP_STATUSES = ['Instalado', 'Em disputa', 'Perdido', 'Ganho'] as const;

export const competitionSchema = z.object({
  clientId: optionalText(64),
  competitor: z.string().trim().min(1, 'Concorrente é obrigatório').max(160),
  competitorProduct: optionalText(200),
  ourProduct: optionalText(200),
  competitorValue: z.coerce.number().min(0).optional().nullable(),
  ourValue: z.coerce.number().min(0).optional().nullable(),
  status: z.enum(COMP_STATUSES).default('Em disputa'),
  salespersonId: optionalText(64),
  dealId: optionalText(64),
  notes: optionalText(2000),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const salespersonSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório').max(160),
  email: z
    .string()
    .trim()
    .email()
    .max(200)
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
  phone: optionalText(40),
  role: optionalText(120),
});

export const iaChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.string(),
        content: z.string().max(8000),
      }),
    )
    .min(1, 'É preciso pelo menos uma mensagem')
    .max(40),
  system: z.string().max(4000).optional(),
  context: z.string().max(60000).optional(),
  scope: z.enum(['global', 'client']).optional(),
  clientId: optionalText(64),
});

export const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Nenhum registo selecionado').max(500),
  patch: z
    .object({
      status: z.enum(CLIENT_STATUSES).optional(),
      salespersonId: z.string().optional(),
      callState: z.enum(CALL_STATES).optional(),
      starred: z.coerce.boolean().optional(),
    })
    .refine((p) => Object.keys(p).length > 0, 'Nada para atualizar'),
});

/**
 * Rotas de IA que não tinham validação nenhuma.
 *
 * Aceitavam `req.body` arbitrário e interpolavam-no diretamente no prompt.
 * Um nome de empresa com quebras de linha e marcadores de sistema podia
 * quebrar o contexto e sobrepor-se às instruções — injeção indireta de prompt
 * (OWASP LLM01). Os limites de comprimento também travam o uso do endpoint
 * (e da chave paga) como modelo de linguagem pessoal.
 */
export const iaNewsSchema = z.object({
  name: z.string().trim().min(1, 'Nome da empresa é obrigatório').max(200),
  sector: optionalText(120),
  city: optionalText(120),
});

export const iaEmailSchema = z.object({
  /** Só é usado para escolher o tom; o contexto real vem da base de dados. */
  intent: optionalText(500),
  clientId: optionalText(64),
});

/**
 * Importação em massa.
 *
 * Aceitava `rows` sem limite nem tipos: 100 mil linhas de objetos arbitrários
 * entravam pelo endpoint adentro e eram percorridas em memória. O teto é
 * deliberadamente baixo — uma importação maior faz-se em lotes, e assim uma
 * chamada isolada nunca compromete o processo.
 */
export const importSchema = z.object({
  rows: z
    .array(z.record(z.string(), z.union([z.string(), z.number(), z.null()])))
    .min(1, 'Nenhuma linha para importar')
    .max(5000, 'Máximo de 5000 linhas por importação'),
});
