/**
 * Correção de transcrição de voz para o vocabulário do CRM.
 *
 * O reconhecimento do browser em pt-PT erra sistematicamente nos mesmos termos
 * ("e-mail" partido, "telefone ma", muletas de arranque). Estas regras corrigem
 * o que é seguro corrigir — nunca adivinham conteúdo, só normalizam palavras
 * conhecidas do domínio.
 */

/** Termos do CRM que a transcrição costuma partir ou trocar. */
const TERM_FIXES: [RegExp, string][] = [
  // email
  [/\be[-\s]?mails?\b/gi, 'email'],
  [/\bmail\b/gi, 'email'],
  [/\bemails\b/gi, 'email'],
  // telefonema
  [/\btelefone\s*ma\b/gi, 'telefonema'],
  [/\btelefone\s*mas\b/gi, 'telefonema'],
  [/\btele\s*fonema\b/gi, 'telefonema'],
  // reunião
  [/\breuni[aã]o?\s*o\b/gi, 'reunião'],
  [/\bre\s*uni[aã]o\b/gi, 'reunião'],
  // follow-up
  [/\bfollow\s*up\b/gi, 'follow-up'],
  [/\bfolou\s*ap\b/gi, 'follow-up'],
  [/\bfolo\s*ap\b/gi, 'follow-up'],
  // proposta / orçamento
  [/\bor[çc]a\s*mento\b/gi, 'orçamento'],
  [/\bpro\s*posta\b/gi, 'proposta'],
  // garantia
  [/\bgaranti[ad]a?\b/gi, 'garantia'],
  // cliente
  [/\bcli\s*ente\b/gi, 'cliente'],
];

/**
 * Muletas com que a transcrição arranca quando apanha o início a meio.
 * Só são removidas no princípio da frase.
 */
const LEADING_NOISE = [
  /^(esta|está|estamos|estou|estão)\s+(no|em|na|a)\s+(tempo\s+de\s+)?/i,
  /^(é|e)\s+(um|uma)\s+/i,
  /^(por favor|olha|então|pronto|ok)\s+/i,
  /^(um|uma)\s+/i,
];

/** Repetições imediatas da mesma palavra ("email email a dizer"). */
function dedupeWords(s: string) {
  return s.replace(/\b(\w+)(\s+\1\b)+/gi, '$1');
}

export function fixTranscript(raw: string): string {
  let s = raw;

  for (const [re, to] of TERM_FIXES) s = s.replace(re, to);

  for (const re of LEADING_NOISE) s = s.replace(re, '');

  s = dedupeWords(s);

  return s.replace(/\s+/g, ' ').trim();
}

/* ══════════ Aproximação de nomes ══════════ */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Distância de Levenshtein, limitada — para nomes mal transcritos. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Uma palavra do texto parece-se com a palavra alvo?
 * Tolera 1 erro em palavras curtas e 2 em palavras longas — o suficiente para
 * "móvel"/"moveis" ou "alentejo"/"alenteja" sem casar palavras diferentes.
 */
export function fuzzyWordMatch(text: string, target: string): boolean {
  return fuzzyFindWord(text, target) !== null;
}

/**
 * Devolve a palavra DO TEXTO que se parece com o alvo, ou null.
 * É a palavra do texto que interessa: é essa que tem de ser retirada das notas
 * quando a transcrição a escreveu mal ("alenteja" por "Alentejo").
 */
export function fuzzyFindWord(text: string, target: string): string | null {
  const t = norm(target);
  if (t.length < 4) return norm(text).includes(t) ? t : null;

  // Tolerância proporcional: apanha singular/plural e trocas de vogal
  // ("movel"/"moveis", "alenteja"/"alentejo") sem casar palavras distintas.
  const tol = t.length > 8 ? 3 : t.length > 5 ? 2 : 1;
  for (const w of norm(text).split(' ')) {
    if (Math.abs(w.length - t.length) > tol) continue;
    if (editDistance(w, t) <= tol) return w;
  }
  return null;
}
