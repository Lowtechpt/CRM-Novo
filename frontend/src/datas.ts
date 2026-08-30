/**
 * Datas do CRM, sempre no fuso de quem usa a aplicação.
 *
 * `new Date().toISOString().slice(0, 10)` parece a forma óbvia de obter "hoje"
 * e está errada: `toISOString` converte para UTC. Em Portugal, entre a
 * meia-noite e a 1h (2h no verão), devolve **a data de ontem**.
 *
 * Num CRM cuja métrica central é recência de contacto — "há quantos dias não
 * falamos com este cliente", "Custo do Silêncio" — enganar-se num dia é
 * enganar-se no produto. E "amanhã", dito por um comercial à meia-noite e dez,
 * significa amanhã para ele, não para o meridiano de Greenwich.
 *
 * O erro apareceu sozinho: uma suite de testes que passava às 23h começou a
 * falhar à meia-noite e cinco, porque o parser de comandos usava data local
 * (bem) e os testes usavam UTC (mal).
 *
 * Todas as datas do sistema são `YYYY-MM-DD` locais. Comparam-se como texto,
 * que para este formato é o mesmo que comparar cronologicamente.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` no fuso local. */
export function paraIso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Hoje, no fuso local. */
export const hoje = () => paraIso();

/** Data daqui a `n` dias (negativo para o passado), no fuso local. */
export function emDias(n: number, base: Date = new Date()): string {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return paraIso(d);
}

/**
 * Dias decorridos entre uma data `YYYY-MM-DD` e hoje.
 *
 * Interpreta a data ao meio-dia local de propósito: à meia-noite, o desvio de
 * uma hora do horário de verão faria a subtração cair no dia anterior.
 */
export function diasDesde(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return null;
  const alvo = new Date(a, m - 1, d, 12, 0, 0);
  const agora = new Date();
  const hojeMeioDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 12, 0, 0);
  return Math.round((hojeMeioDia.getTime() - alvo.getTime()) / 86400000);
}
