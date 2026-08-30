import { describe, it, expect } from 'vitest';
import { txt, num, bool } from './linhas.js';

describe('txt', () => {
  it('devolve o texto tal como está', () => {
    expect(txt('Silva & Irmãos')).toBe('Silva & Irmãos');
  });

  it('converte null e undefined em string vazia, não em "null"', () => {
    expect(txt(null)).toBe('');
    expect(txt(undefined)).toBe('');
  });

  it('converte números em texto', () => {
    expect(txt(0)).toBe('0');
    expect(txt(42)).toBe('42');
  });

  it('preserva a string vazia', () => {
    expect(txt('')).toBe('');
  });

  it('converte booleanos', () => {
    expect(txt(false)).toBe('false');
  });
});

describe('num', () => {
  it('devolve números inalterados', () => {
    expect(num(1500)).toBe(1500);
    expect(num(0)).toBe(0);
    expect(num(-30)).toBe(-30);
  });

  it('converte texto numérico', () => {
    expect(num('2500')).toBe(2500);
    expect(num('12.5')).toBe(12.5);
  });

  it('trata null e undefined como zero', () => {
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
  });

  it('nunca devolve NaN — texto não numérico vira zero', () => {
    expect(num('abc')).toBe(0);
    expect(num({})).toBe(0);
    expect(num(NaN)).toBe(0);
  });

  it('nunca devolve infinito', () => {
    expect(num(Infinity)).toBe(0);
    expect(num(-Infinity)).toBe(0);
  });

  it('a string vazia é zero', () => {
    expect(num('')).toBe(0);
  });
});

describe('bool', () => {
  it('1 é verdadeiro, 0 é falso — é assim que o SQLite guarda', () => {
    expect(bool(1)).toBe(true);
    expect(bool(0)).toBe(false);
  });

  it('aceita o mesmo em texto', () => {
    expect(bool('1')).toBe(true);
    expect(bool('0')).toBe(false);
  });

  it('null e undefined são falsos', () => {
    expect(bool(null)).toBe(false);
    expect(bool(undefined)).toBe(false);
  });

  it('só o 1 é verdadeiro: qualquer outro número é falso', () => {
    expect(bool(2)).toBe(false);
    expect(bool(-1)).toBe(false);
    expect(bool('sim')).toBe(false);
  });

  it('aceita booleanos verdadeiros, porque `Number(true)` é 1', () => {
    expect(bool(true)).toBe(true);
    expect(bool(false)).toBe(false);
  });
});
