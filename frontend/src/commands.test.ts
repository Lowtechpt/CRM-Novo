import { describe, it, expect } from 'vitest';
import { parseCommand } from './commands';
import { fixTranscript, fuzzyFindWord, editDistance } from './voiceFix';
import type { Client } from './types';

/**
 * O interpretador de comandos e a correção de voz são lógica pura — não
 * dependem de rede nem de DOM. São também onde os bugs passam despercebidos:
 * um `\b` mal escapado partiu o reconhecimento de datas sem nada falhar.
 */

const c = (id: string, name: string, extra: Partial<Client> = {}): Client =>
  ({
    id,
    name,
    status: 'Ativo',
    score: 50,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...extra,
  }) as Client;

const CLIENTS = [
  c('1', 'Móveis Alentejo', { city: 'Évora' }),
  c('2', 'Silva & Irmãos Lda'),
  c('3', 'TechNova'),
  c('4', 'Café Costa'),
  c('5', 'Farmácia Central'),
];

// Os testes usam o MESMO utilitário que o código. Antes calculavam as datas
// esperadas em UTC enquanto o parser as produzia em hora local: a suite passava
// de dia e falhava de madrugada.
import { hoje, emDias } from './datas';

describe('parseCommand — identificação do cliente', () => {
  it('encontra pelo nome completo', () => {
    const r = parseCommand('registar email no cliente Móveis Alentejo sobre a garantia', CLIENTS);
    expect(r.kind).toBe('activity');
    if (r.kind === 'activity') expect(r.client.name).toBe('Móveis Alentejo');
  });

  it('encontra com nome mal transcrito pela voz', () => {
    const r = parseCommand('email para o movel alenteja sobre a garantia', CLIENTS);
    expect(r.kind).toBe('activity');
    if (r.kind === 'activity') expect(r.client.name).toBe('Móveis Alentejo');
  });

  it('encontra apesar dos símbolos no nome', () => {
    const r = parseCommand('telefonema para Silva & Irmãos ficaram de enviar orçamento', CLIENTS);
    expect(r.kind).toBe('activity');
    if (r.kind === 'activity') expect(r.client.name).toBe('Silva & Irmãos Lda');
  });

  it('recusa em vez de adivinhar quando não há cliente', () => {
    const r = parseCommand('registar email sobre a garantia', CLIENTS);
    expect(r.kind).toBe('unknown');
  });
});

describe('parseCommand — tipo de atividade', () => {
  const casos: [string, string][] = [
    ['email para TechNova sobre proposta', 'Email'],
    ['telefonema para TechNova ontem', 'Telefonema'],
    ['visita a TechNova', 'Porta Fria'],
    ['nota no TechNova mudou de gerente', 'Nota'],
  ];
  for (const [frase, tipo] of casos) {
    it(`"${frase}" → ${tipo}`, () => {
      const r = parseCommand(frase, CLIENTS);
      expect(r.kind).toBe('activity');
      if (r.kind === 'activity') expect(r.type).toBe(tipo);
    });
  }
});

describe('parseCommand — datas', () => {
  it('amanhã', () => {
    const r = parseCommand('agendar reunião com TechNova amanhã', CLIENTS);
    if (r.kind === 'agenda') expect(r.date).toBe(emDias(1));
    else throw new Error('devia ser agenda');
  });

  it('próxima semana', () => {
    const r = parseCommand('follow-up do Café Costa na proxima semana', CLIENTS);
    if (r.kind === 'agenda') expect(r.date).toBe(emDias(7));
    else throw new Error('devia ser agenda');
  });

  it('hoje é o valor por omissão', () => {
    const r = parseCommand('email para TechNova sobre a proposta', CLIENTS);
    if (r.kind === 'activity') expect(r.date).toBe(hoje());
  });
});

describe('parseCommand — horas', () => {
  it('lê "às 15h"', () => {
    const r = parseCommand('agendar reunião com TechNova amanhã às 15h', CLIENTS);
    if (r.kind === 'agenda') expect(r.time).toBe('15:00');
  });

  it('lê "14:30"', () => {
    const r = parseCommand('agendar reunião com TechNova amanhã 14:30', CLIENTS);
    if (r.kind === 'agenda') expect(r.time).toBe('14:30');
  });

  it('agendamento sem hora fica às 09:00, não à hora atual', () => {
    const r = parseCommand('follow-up do Café Costa amanhã', CLIENTS);
    if (r.kind === 'agenda') expect(r.time).toBe('09:00');
  });
});

describe('parseCommand — notas limpas', () => {
  it('tira o nome do cliente, o verbo e a data', () => {
    const r = parseCommand(
      'registar email no cliente Móveis Alentejo envio de documento de garantia',
      CLIENTS,
    );
    if (r.kind === 'activity') {
      expect(r.notes).toBe('Envio de documento de garantia');
      expect(r.notes.toLowerCase()).not.toContain('alentejo');
      expect(r.notes.toLowerCase()).not.toContain('registar');
    }
  });

  it('tira o nome mesmo quando mal transcrito', () => {
    const r = parseCommand('email para o movel alenteja envio de documento', CLIENTS);
    if (r.kind === 'activity') expect(r.notes.toLowerCase()).not.toContain('alenteja');
  });

  it('não deixa preposições penduradas', () => {
    const r = parseCommand('email para o TechNova sobre a proposta', CLIENTS);
    if (r.kind === 'activity') {
      expect(r.notes).not.toMatch(/^(o|a|de|para|no|na)\s/i);
      expect(r.notes).not.toMatch(/\s(o|a|de|para|no|na)$/i);
    }
  });
});

describe('parseCommand — abrir cliente', () => {
  it('reconhece o comando', () => {
    const r = parseCommand('abrir Farmácia Central', CLIENTS);
    expect(r.kind).toBe('open');
    if (r.kind === 'open') expect(r.client.name).toBe('Farmácia Central');
  });
});

describe('fixTranscript', () => {
  const casos: [string, string][] = [
    ['registar e-mail no cliente', 'registar email no cliente'],
    ['telefone ma para o cliente', 'telefonema para o cliente'],
    ['folou ap na proxima semana', 'follow-up na proxima semana'],
    ['Estamos em um email a dizer', 'email a dizer'],
    ['Esta no tempo de um email com', 'email com'],
  ];
  for (const [cru, esperado] of casos) {
    it(`"${cru}" → "${esperado}"`, () => {
      expect(fixTranscript(cru)).toBe(esperado);
    });
  }

  it('colapsa palavras repetidas seguidas', () => {
    expect(fixTranscript('enviei enviei o documento')).toBe('enviei o documento');
  });
});

describe('fuzzyFindWord', () => {
  it('apanha singular/plural', () => {
    expect(fuzzyFindWord('o movel esta pronto', 'moveis')).toBe('movel');
  });

  it('apanha troca de vogal final', () => {
    expect(fuzzyFindWord('cliente de alenteja', 'alentejo')).toBe('alenteja');
  });

  it('não casa palavras diferentes', () => {
    expect(fuzzyFindWord('a fatura do cliente', 'alentejo')).toBeNull();
  });
});

describe('editDistance', () => {
  it('zero para strings iguais', () => expect(editDistance('abc', 'abc')).toBe(0));
  it('conta substituições', () => expect(editDistance('abc', 'abd')).toBe(1));
  it('conta inserções', () => expect(editDistance('abc', 'abcd')).toBe(1));
  it('lida com string vazia', () => expect(editDistance('', 'abc')).toBe(3));
});
