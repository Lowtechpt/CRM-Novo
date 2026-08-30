import type { Client, ActivityType, AgendaType } from './types';
import { fuzzyFindWord } from './voiceFix';

/**
 * Interpretador de comandos em português — por regras, sem IA.
 *
 * Determinístico: não inventa, não precisa de chave, não tem latência e
 * funciona offline. Combina com o ditado por voz, para registar uma interação
 * a falar em vez de preencher um formulário.
 *
 * Exemplos que entende:
 *   "registar email no cliente Móveis Alentejo a falar sobre a garantia"
 *   "telefonema para Silva & Irmãos ficaram de enviar orçamento"
 *   "agendar reunião com TechNova amanhã às 15h"
 *   "follow-up do Café Costa dia 30"
 *   "nota no Hotel Vista Mar mudou de gerente"
 *   "abrir Farmácia Central"
 */

export type Command =
  | {
      kind: 'activity';
      type: ActivityType;
      client: Client;
      notes: string;
      date: string;
      time: string;
    }
  | {
      kind: 'agenda';
      type: AgendaType;
      client: Client | null;
      title: string;
      date: string;
      time: string;
    }
  | { kind: 'open'; client: Client }
  | { kind: 'unknown'; reason: string };

/** Minúsculas, sem acentos e sem pontuação — para comparar texto livre. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // O ":" fica de fora: é significativo em horas ("14:30" não pode virar "14 30")
    .replace(/[.,;!?"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* ── Vocabulário ── */

const ACTIVITY_WORDS: [RegExp, ActivityType][] = [
  [/\b(telefonema|chamada|liguei|ligacao|telefonei|telefone)\b/, 'Telefonema'],
  [/\b(email|mail|e-mail|correio)\b/, 'Email'],
  [/\b(reuniao|meeting|encontro)\b/, 'Reunião'],
  [/\b(porta fria|visita|passei|passagem)\b/, 'Porta Fria'],
  [/\b(proposta|orcamento|cotacao)\b/, 'Proposta'],
  [/\b(nota|apontamento|registo)\b/, 'Nota'],
];

const AGENDA_WORDS: [RegExp, AgendaType][] = [
  [/\b(follow-?up|seguimento)\b/, 'Follow-up'],
  [/\b(demo|demonstracao)\b/, 'Demo'],
  [/\b(reuniao|meeting|encontro)\b/, 'Reunião'],
  [/\b(telefonema|chamada|ligar)\b/, 'Telefonema'],
];

/** Verbos que indicam agendar algo no futuro, em vez de registar o passado. */
const SCHEDULE_VERB = /\b(agendar|agenda|marcar|marca|marquei|agendei|lembrar|lembra)\b/;
const REGISTER_VERB =
  /\b(registar|regista|registei|adicionar|adiciona|criar|cria|anotar|anota|apontar)\b/;
const OPEN_VERB = /\b(abrir|abre|mostrar|mostra|ver|ir para)\b/;

const WEEKDAYS: [RegExp, number][] = [
  [/\bdomingo\b/, 0],
  [/\bsegunda\b/, 1],
  [/\bterca\b/, 2],
  [/\bquarta\b/, 3],
  [/\bquinta\b/, 4],
  [/\bsexta\b/, 5],
  [/\bsabado\b/, 6],
];

const MONTHS: Record<string, number> = {
  janeiro: 0,
  fevereiro: 1,
  marco: 2,
  abril: 3,
  maio: 4,
  junho: 5,
  julho: 6,
  agosto: 7,
  setembro: 8,
  outubro: 9,
  novembro: 10,
  dezembro: 11,
};

/* ── Extração de data e hora ── */

function extractDate(t: string): { date: string; matched: string[] } {
  const now = new Date();
  const matched: string[] = [];

  if (/\bhoje\b/.test(t)) {
    matched.push('hoje');
    return { date: iso(now), matched };
  }

  if (/\bdepois de amanha\b/.test(t)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    matched.push('depois de amanha');
    return { date: iso(d), matched };
  }
  if (/\bamanha\b/.test(t)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    matched.push('amanha');
    return { date: iso(d), matched };
  }
  if (/\bontem\b/.test(t)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    matched.push('ontem');
    return { date: iso(d), matched };
  }

  if (/\b(proxima semana|para a semana|na semana que vem)\b/.test(t)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    matched.push(t.match(/\b(proxima semana|para a semana|na semana que vem)\b/)![0]);
    return { date: iso(d), matched };
  }
  if (/\b(proximo mes|para o mes que vem)\b/.test(t)) {
    const d = new Date(now);
    d.setMonth(d.getMonth() + 1);
    matched.push(t.match(/\b(proximo mes|para o mes que vem)\b/)![0]);
    return { date: iso(d), matched };
  }

  // "dia 15 de setembro" / "dia 15"
  const dm = t.match(/\bdia (\d{1,2})(?: de (\w+))?/);
  if (dm) {
    const day = Number(dm[1]);
    const d = new Date(now);
    if (dm[2] && MONTHS[dm[2]] !== undefined) d.setMonth(MONTHS[dm[2]]);
    d.setDate(day);
    // Sem mês explícito e já passou: assume o mês seguinte
    if (!dm[2] && d < now) d.setMonth(d.getMonth() + 1);
    matched.push(dm[0]);
    return { date: iso(d), matched };
  }

  // Dia da semana → próxima ocorrência
  for (const [re, wd] of WEEKDAYS) {
    const m = t.match(re);
    if (m) {
      const d = new Date(now);
      const delta = (wd - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + delta);
      matched.push(m[0]);
      return { date: iso(d), matched };
    }
  }

  return { date: iso(now), matched };
}

function extractTime(t: string, forSchedule = false): { time: string; matched: string[] } {
  const matched: string[] = [];

  // "às 14:30" / "as 14h30" / "às 9h" / "às 9 horas"
  const m = t.match(/\b(?:as|a)?\s*(\d{1,2})\s*(?:h|:|horas?)\s*(\d{2})?\b/);
  if (m) {
    let h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (/\bda tarde\b|\bda noite\b/.test(t) && h < 12) h += 12;
    if (h >= 0 && h <= 23) {
      matched.push(m[0]);
      return { time: `${pad(h)}:${pad(min)}`, matched };
    }
  }
  if (/\bde manha\b/.test(t)) {
    matched.push('de manha');
    return { time: '09:30', matched };
  }
  if (/\bda tarde\b/.test(t)) {
    matched.push('da tarde');
    return { time: '15:00', matched };
  }

  // Sem hora dita: um agendamento fica de manhã; um registo fica na hora a que
  // está a ser registado.
  if (forSchedule) return { time: '09:00', matched };
  const now = new Date();
  return { time: `${pad(now.getHours())}:${pad(now.getMinutes())}`, matched };
}

/* ── Identificação do cliente ── */

/** Palavras curtas e genéricas não servem para identificar um cliente. */
const STOP = new Set([
  'lda',
  'sa',
  'unipessoal',
  'em',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'e',
  'the',
  'a',
  'o',
  'com',
  'no',
  'na',
  'para',
  'cliente',
  'sobre',
]);

function findClient(text: string, clients: Client[]): { client: Client | null; matched: string } {
  const t = norm(text);
  let best: { client: Client; score: number; matched: string } | null = null;

  for (const c of clients) {
    const full = norm(c.name);
    // Nome completo presente no texto: é o sinal mais forte
    if (full.length > 3 && t.includes(full)) {
      const score = 1000 + full.length;
      if (!best || score > best.score) best = { client: c, score, matched: full };
      continue;
    }
    // Senão, conta quantas palavras distintivas do nome aparecem.
    // O match exato conta mais; o aproximado apanha erros de transcrição
    // ("móvel" por "móveis", "alenteja" por "alentejo").
    const words = full.split(' ').filter((w) => w.length > 2 && !STOP.has(w));
    if (!words.length) continue;

    const exact = words.filter((w) => t.includes(w));
    // Guarda a palavra COMO ESTÁ NO TEXTO, para depois ser removida das notas
    const fuzzy = words
      .filter((w) => !exact.includes(w))
      .map((w) => fuzzyFindWord(t, w))
      .filter((w): w is string => w !== null);
    const hits = [...exact, ...fuzzy];

    if (hits.length) {
      const score = exact.length * 10 + fuzzy.length * 6 + hits.join('').length;
      // Exige pelo menos metade das palavras, para não casar por acaso
      if (hits.length * 2 >= words.length && (!best || score > best.score)) {
        best = { client: c, score, matched: hits.join(' ') };
      }
    }
  }

  return best ? { client: best.client, matched: best.matched } : { client: null, matched: '' };
}

/* ── Parser ── */

export function parseCommand(input: string, clients: Client[]): Command {
  const raw = input.trim();
  if (!raw) return { kind: 'unknown', reason: 'Comando vazio.' };

  const t = norm(raw);
  const { client, matched: clientMatch } = findClient(raw, clients);

  // "abrir <cliente>"
  if (OPEN_VERB.test(t)) {
    if (!client) return { kind: 'unknown', reason: 'Não percebi que cliente abrir.' };
    return { kind: 'open', client };
  }

  const isSchedule = SCHEDULE_VERB.test(t) || /\bfollow-?up\b/.test(t);
  const { date, matched: dateWords } = extractDate(t);
  const { time, matched: timeWords } = extractTime(t, isSchedule);

  // Tipo de atividade / evento
  let actType: ActivityType | null = null;
  for (const [re, type] of ACTIVITY_WORDS)
    if (re.test(t)) {
      actType = type;
      break;
    }
  let agType: AgendaType | null = null;
  for (const [re, type] of AGENDA_WORDS)
    if (re.test(t)) {
      agType = type;
      break;
    }

  /** Limpa do texto tudo o que já foi interpretado, e sobra o conteúdo. */
  function contentOf(consumed: string[]) {
    let out = ` ${t} `;
    // Palavra a palavra: um nome com símbolos ("Silva & Irmãos") não bate
    // como string única contra o texto normalizado.
    const words = consumed.flatMap((c) => (c || '').split(/\s+/)).filter(Boolean);
    for (const w of words) {
      out = out.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), ' ');
    }
    out = out
      // Símbolos que ligavam partes do nome ficam órfãos
      .replace(/\s[&+\-–]\s/g, ' ')
      .replace(SCHEDULE_VERB, ' ')
      .replace(REGISTER_VERB, ' ')
      .replace(OPEN_VERB, ' ')
      .replace(/\b(no|na|do|da|com|para|ao|a|o|em|de)\s+cliente\b/g, ' ')
      .replace(/\b(cliente|clientes)\b/g, ' ')
      .replace(/\b(a falar|falar|sobre|acerca de|acerca)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Preposições e artigos que ficaram pendurados depois das remoções
    const FILLER =
      /^(no|na|nos|nas|do|da|dos|das|com|para|pelo|pela|em|de|ao|aos|a|o|os|as|e|que|um|uma)$/;
    const parts = out.split(' ').filter(Boolean);
    while (parts.length && FILLER.test(parts[0])) parts.shift();
    while (parts.length && FILLER.test(parts[parts.length - 1])) parts.pop();

    return parts.join(' ');
  }

  if (isSchedule) {
    const consumed = [...dateWords, ...timeWords, clientMatch, agType ? norm(agType) : ''];
    const body = contentOf(consumed);
    const title = body || `${agType || 'Evento'}${client ? ` — ${client.name}` : ''}`;
    return {
      kind: 'agenda',
      type: agType || 'Reunião',
      client,
      title: title.charAt(0).toUpperCase() + title.slice(1),
      date,
      time,
    };
  }

  // Registo de atividade: precisa de cliente
  if (!client) {
    return {
      kind: 'unknown',
      reason: 'Não identifiquei o cliente. Diz o nome como está na ficha.',
    };
  }

  const consumed = [...dateWords, ...timeWords, clientMatch, actType ? norm(actType) : ''];
  const notes = contentOf(consumed);

  return {
    kind: 'activity',
    type: actType || 'Nota',
    client,
    notes: notes ? notes.charAt(0).toUpperCase() + notes.slice(1) : '',
    date,
    time,
  };
}

/** Descrição do que o comando vai fazer, para confirmação antes de executar. */
export function describe(cmd: Command): string {
  switch (cmd.kind) {
    case 'activity':
      return `Registar ${cmd.type} em ${cmd.client.name} · ${cmd.date} ${cmd.time}`;
    case 'agenda':
      return `Agendar ${cmd.type}${cmd.client ? ` com ${cmd.client.name}` : ''} · ${cmd.date} ${cmd.time}`;
    case 'open':
      return `Abrir ${cmd.client.name}`;
    default:
      return cmd.reason;
  }
}
