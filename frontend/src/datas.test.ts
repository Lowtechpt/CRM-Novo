import { describe, it, expect, vi, afterEach } from 'vitest';
import { paraIso, hoje, emDias, diasDesde } from './datas';

afterEach(() => {
  vi.useRealTimers();
});

function relogio(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe('paraIso', () => {
  it('formata no fuso local, não em UTC', () => {
    relogio('2026-03-15T00:10:00');
    expect(paraIso()).toBe('2026-03-15');
  });

  it('preenche mês e dia com zero à esquerda', () => {
    expect(paraIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('aceita uma data explícita', () => {
    expect(paraIso(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('hoje', () => {
  it('devolve a data local corrente', () => {
    relogio('2026-08-30T23:55:00');
    expect(hoje()).toBe('2026-08-30');
  });

  it('vira o dia à meia-noite local, não à meia-noite de Greenwich', () => {
    relogio('2026-08-31T00:05:00');
    expect(hoje()).toBe('2026-08-31');
  });
});

describe('emDias', () => {
  it('avança dias', () => {
    expect(emDias(3, new Date(2026, 7, 30))).toBe('2026-09-02');
  });

  it('recua com números negativos', () => {
    expect(emDias(-5, new Date(2026, 7, 3))).toBe('2026-07-29');
  });

  it('zero é o próprio dia', () => {
    expect(emDias(0, new Date(2026, 7, 30))).toBe('2026-08-30');
  });

  it('atravessa a mudança de ano', () => {
    expect(emDias(2, new Date(2026, 11, 30))).toBe('2027-01-01');
  });

  it('trata fevereiro de ano bissexto', () => {
    expect(emDias(1, new Date(2028, 1, 28))).toBe('2028-02-29');
  });

  it('não altera a data que recebe', () => {
    const base = new Date(2026, 7, 30);
    emDias(10, base);
    expect(base.getDate()).toBe(30);
  });
});

describe('diasDesde', () => {
  it('hoje são zero dias', () => {
    relogio('2026-08-30T09:00:00');
    expect(diasDesde('2026-08-30')).toBe(0);
  });

  it('ontem é um dia', () => {
    relogio('2026-08-30T09:00:00');
    expect(diasDesde('2026-08-29')).toBe(1);
  });

  it('conta um mês inteiro', () => {
    relogio('2026-08-30T09:00:00');
    expect(diasDesde('2026-07-31')).toBe(30);
  });

  it('devolve negativo para datas futuras', () => {
    relogio('2026-08-30T09:00:00');
    expect(diasDesde('2026-09-02')).toBe(-3);
  });

  it('não se engana à meia-noite', () => {
    relogio('2026-08-30T00:00:30');
    expect(diasDesde('2026-08-30')).toBe(0);
    expect(diasDesde('2026-08-29')).toBe(1);
  });

  it('não se engana na mudança para a hora de verão', () => {
    relogio('2026-03-29T12:00:00');
    expect(diasDesde('2026-03-28')).toBe(1);
    expect(diasDesde('2026-03-27')).toBe(2);
  });

  it('aceita um carimbo de data/hora completo e ignora as horas', () => {
    relogio('2026-08-30T09:00:00');
    expect(diasDesde('2026-08-28T23:45:12.000Z')).toBe(2);
  });

  it('devolve null para entradas em falta', () => {
    expect(diasDesde(null)).toBeNull();
    expect(diasDesde(undefined)).toBeNull();
    expect(diasDesde('')).toBeNull();
  });

  it('devolve null para texto que não é uma data', () => {
    expect(diasDesde('ontem')).toBeNull();
    expect(diasDesde('0000-00-00')).toBeNull();
  });
});
