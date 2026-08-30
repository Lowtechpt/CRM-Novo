/** Formatação e cálculos usados por vários blocos do registo do cliente. */

export const eur = (n: number) => `€${n.toLocaleString('pt-PT')}`;

export const daysBetween = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

export const STATUS_CLASS: Record<string, string> = {
  Prospeto: 'st-prospeto',
  Contactado: 'st-contactado',
  Inativo: 'st-inativo',
};
