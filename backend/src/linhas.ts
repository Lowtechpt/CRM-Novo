/**
 * A fronteira com a base de dados, num sítio só.
 *
 * O driver do SQLite devolve linhas sem tipo — e não pode devolver de outra
 * forma: o esquema vive em ficheiros `.sql`, não no TypeScript. Antes, cada
 * rota resolvia isso com o seu próprio `as any[]`, 77 vezes espalhadas pelo
 * projeto. O tipo não ficava mais seguro por isso: ficava só menos visível,
 * e um `any` disperso é indistinguível de descuido.
 *
 * Concentrar aqui torna a decisão explícita: existe exatamente um ponto onde
 * dados por validar entram na aplicação, e está assinalado. Tudo o que sai
 * daqui para uma resposta HTTP passa por uma função de mapeamento
 * (`rowToClient`, `rowToDeal`, …) que lhe dá forma conhecida.
 *
 * A alternativa séria seria gerar tipos a partir do esquema (Drizzle, Kysely,
 * `sqlite-to-ts`). Está registado em `docs/decisoes.md` §2 como custo assumido
 * da escolha de não usar ORM.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LinhaBD = Record<string, any>;

/** Coerções explícitas: o SQLite devolve inteiros, texto e NULL sem distinção fiável. */
export const txt = (v: unknown): string => (v == null ? '' : String(v));
export const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
export const bool = (v: unknown): boolean => num(v) === 1;
