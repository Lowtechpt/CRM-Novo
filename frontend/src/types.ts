export type ClientStatus = 'Prospeto' | 'Contactado' | 'Ativo' | 'Inativo';
export type CallState = '' | 'no-answer' | 'vacation';

export interface Client {
  id: string;
  name: string;
  nif?: string;
  sector?: string;
  cae?: string;
  status: ClientStatus;
  contact?: string;
  score: number;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  notes?: string;
  lat?: number;
  lng?: number;
  starred?: boolean;
  callState?: CallState;
  salespersonId?: string;
  /** Empresa-mãe: suporta grupos empresariais e filiais. */
  parentId?: string;
  createdAt: string;
  updatedAt: string;
}

export type ActivityType = 'Telefonema' | 'Email' | 'Reunião' | 'Porta Fria' | 'Proposta' | 'Nota';
/** Mesma ordem do CRM de referência (Gestao-Comercial, index.js:10). */
export const ACT_TYPES: ActivityType[] = [
  'Telefonema',
  'Email',
  'Reunião',
  'Porta Fria',
  'Proposta',
  'Nota',
];
export const ACT_ABBR: Record<ActivityType, string> = {
  Telefonema: 'TEL',
  Email: 'EM',
  Reunião: 'RE',
  'Porta Fria': 'PF',
  Proposta: 'PR',
  Nota: 'NT',
};

export interface Activity {
  id: string;
  clientId: string;
  type: ActivityType;
  date: string;
  time: string;
  notes: string;
  spokeTo?: string;
  createdAt: string;
}

export interface Interlocutor {
  id: string;
  clientId: string;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
}

/** Estágios iguais ao CRM de referência (index.js:9), mais o ciclo pós-venda. */
export type DealStage =
  | 'Prospeto'
  | 'Contactado'
  | 'Proposta'
  | 'Negociação'
  | 'Ganho'
  | 'Perdido'
  | 'Onboarding'
  | 'Em serviço'
  | 'Renovação';

/** As 6 colunas do kanban original. */
export const CRM_STAGES: DealStage[] = [
  'Prospeto',
  'Contactado',
  'Proposta',
  'Negociação',
  'Ganho',
  'Perdido',
];
/** Extensão pós-venda (ver INVESTIGACAO/: nenhum dos Top 5 tem isto no pipeline). */
export const POSTSALE_STAGES: DealStage[] = ['Onboarding', 'Em serviço', 'Renovação'];
/** Todas as colunas mostradas no kanban. */
export const ALL_STAGES: DealStage[] = [...CRM_STAGES, ...POSTSALE_STAGES];
/** Negócio ainda em aberto (nem ganho nem perdido). */
export const OPEN_STAGES: DealStage[] = ['Prospeto', 'Contactado', 'Proposta', 'Negociação'];
/** Negócio ganho, em qualquer fase do ciclo de vida. */
export const WON_STAGES: DealStage[] = ['Ganho', 'Onboarding', 'Em serviço', 'Renovação'];

export interface Deal {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  value: number;
  stage: DealStage;
  probability: number;
  /** Valor recorrente mensal, para MRR/ARR. */
  recurringValue?: number;
  dueDate?: string;
  createdAt: string;
}

export type AgendaType = 'Reunião' | 'Demo' | 'Follow-up' | 'Telefonema' | 'Outro';
export const AGENDA_TYPES: AgendaType[] = ['Reunião', 'Demo', 'Follow-up', 'Telefonema', 'Outro'];

export interface AgendaEvent {
  id: string;
  clientId?: string;
  clientName?: string;
  type: AgendaType;
  title: string;
  notes?: string;
  date: string;
  time: string;
  done: boolean;
}

export interface Salesperson {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
}

export type CompStatus = 'Instalado' | 'Em disputa' | 'Perdido' | 'Ganho';
export const COMP_STATUSES: CompStatus[] = ['Instalado', 'Em disputa', 'Perdido', 'Ganho'];

export interface Competition {
  id: string;
  clientId?: string;
  clientName?: string;
  clientSector?: string;
  competitor: string;
  competitorProduct?: string;
  ourProduct?: string;
  competitorValue?: number;
  ourValue?: number;
  status: CompStatus;
  salespersonId?: string;
  salespersonName?: string;
  dealId?: string;
  notes?: string;
  date: string;
}

/** Métricas agregadas por cliente, calculadas no servidor (GET /clients/summary). */
export interface ClientSummary {
  clientId: string;
  lastActivity: string | null;
  daysSinceContact: number | null;
  activityCount: number;
  interlocutorCount: number;
  openValue: number;
  openDeals: number;
  wonValue: number;
  nextEvent: { date: string; type: string } | null;
  hasUpcomingMeeting: boolean;
  pendingFollowups: number;
}

/* ══════════ Respostas das rotas de análise ══════════
   Estavam declaradas dentro das páginas que as consomem, e o cliente da API
   devolvia `any`. Ficam aqui para que o contrato seja um só e o compilador
   apanhe qualquer divergência entre o que o servidor manda e o que a UI lê. */

/** Evento de hoje: tem hora, e a data é implícita. */
export interface EventoDeHoje {
  id: string;
  title: string;
  time: string;
  type: string;
  clientName?: string;
}

/** Evento em atraso: o que interessa é a data em que devia ter acontecido. */
export interface EventoAtrasado {
  id: string;
  title: string;
  date: string;
  type: string;
  clientName?: string;
}

export interface Briefing {
  date: string;
  hoje: EventoDeHoje[];
  atrasados: EventoAtrasado[];
  semProximoPasso: { id: string; name: string; value: number; days: number | null }[];
  arrefecer: { id: string; name: string; days: number | null; status: string }[];
}

export interface SilenceItem {
  id: string;
  name: string;
  value: number;
  days: number | null;
  city?: string;
  status: string;
  nextEvent?: { date: string; type: string } | null;
}

export interface Silence {
  total: number;
  /** Valor em risco por escalão de dias sem contacto ('30' | '60' | '90'). */
  buckets: Record<string, number>;
  count: number;
  items: SilenceItem[];
}

export interface Forecast {
  months: { month: string; weighted: number; gross: number; deals: number }[];
  totalWeighted: number;
  totalGross: number;
  mrr: number;
}

export interface DuplicateGroup {
  reason: string;
  key: string;
  clients: { id: string; name: string; nif?: string; email?: string; city?: string }[];
}

export interface AuditEntry {
  id: number;
  entity: string;
  entity_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  user_id: string | null;
  user_name: string | null;
  at: string;
}

/** Uma parcela do cálculo do score, como o servidor a devolve. */
export interface ScoreParcela {
  label: string;
  points: number;
  detail: string;
}

export interface ScoreDetalhe {
  score: number;
  breakdown: ScoreParcela[];
}
