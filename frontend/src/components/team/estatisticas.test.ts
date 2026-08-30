import { describe, it, expect } from 'vitest';
import type { Client, Activity, Deal, AgendaEvent, Salesperson } from '../../types';
import {
  type DadosEquipa,
  channelStats,
  conversionStats,
  timingStats,
  persistenceStats,
  qualityStats,
} from './estatisticas';

/**
 * Testes das métricas da página Equipa.
 *
 * Só existem porque os cálculos saíram de dentro do componente: enquanto
 * viviam fechados sobre o estado do React, 180 linhas de matemática que
 * alimentam rankings e avaliações de desempenho não tinham forma de ser
 * verificadas sem montar a interface toda.
 */

const comercial = (id: string, name = id): Salesperson => ({ id, name });

const cliente = (over: Partial<Client> = {}): Client => ({
  id: `c${Math.random().toString(36).slice(2, 8)}`,
  name: 'Cliente',
  status: 'Prospeto',
  score: 50,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...over,
});

const atividade = (clientId: string, over: Partial<Activity> = {}): Activity => ({
  id: `a${Math.random().toString(36).slice(2, 8)}`,
  clientId,
  type: 'Telefonema',
  date: '2026-06-01',
  time: '10:00',
  notes: '',
  createdAt: '2026-06-01',
  ...over,
});

const negocio = (clientId: string, over: Partial<Deal> = {}): Deal => ({
  id: `d${Math.random().toString(36).slice(2, 8)}`,
  clientId,
  clientName: 'Cliente',
  title: 'Negócio',
  value: 1000,
  stage: 'Proposta',
  probability: 50,
  createdAt: '2026-06-01',
  ...over,
});

const dados = (over: Partial<DadosEquipa> = {}): DadosEquipa => ({
  clients: [],
  activities: [],
  deals: [],
  agenda: [] as AgendaEvent[],
  people: [],
  ...over,
});

describe('channelStats', () => {
  it('conta cada canal separadamente', () => {
    const c = cliente({ salespersonId: 'sp1' });
    const d = dados({
      people: [comercial('sp1')],
      clients: [c],
      activities: [
        atividade(c.id, { type: 'Telefonema' }),
        atividade(c.id, { type: 'Telefonema' }),
        atividade(c.id, { type: 'Email' }),
      ],
    });

    const r = channelStats(d, new Set(['sp1']));
    expect(r.find((x) => x.type === 'Telefonema')!.total).toBe(2);
    expect(r.find((x) => x.type === 'Email')!.total).toBe(1);
    expect(r.find((x) => x.type === 'Reunião')!.total).toBe(0);
  });

  it('só conta como sucesso a atividade num cliente com negócio ganho', () => {
    const ganho = cliente({ salespersonId: 'sp1' });
    const perdido = cliente({ salespersonId: 'sp1' });
    const d = dados({
      people: [comercial('sp1')],
      clients: [ganho, perdido],
      activities: [atividade(ganho.id), atividade(perdido.id)],
      deals: [negocio(ganho.id, { stage: 'Ganho' }), negocio(perdido.id, { stage: 'Perdido' })],
    });

    const tel = channelStats(d, new Set(['sp1'])).find((x) => x.type === 'Telefonema')!;
    expect(tel.total).toBe(2);
    expect(tel.successful).toBe(1);
    expect(tel.rate).toBe(50);
  });

  it('não divide por zero quando não há atividades', () => {
    const r = channelStats(dados({ people: [comercial('sp1')] }), new Set(['sp1']));
    expect(r.every((x) => x.rate === 0)).toBe(true);
    expect(r.every((x) => x.bestDay === null)).toBe(true);
  });

  it('ignora clientes de outro comercial', () => {
    const meu = cliente({ salespersonId: 'sp1' });
    const alheio = cliente({ salespersonId: 'sp2' });
    const d = dados({
      people: [comercial('sp1'), comercial('sp2')],
      clients: [meu, alheio],
      activities: [atividade(meu.id), atividade(alheio.id), atividade(alheio.id)],
    });

    const tel = channelStats(d, new Set(['sp1'])).find((x) => x.type === 'Telefonema')!;
    expect(tel.total).toBe(1);
  });
});

describe('conversionStats', () => {
  it('conta os negócios por fase', () => {
    const c = cliente({ salespersonId: 'sp1' });
    const d = dados({
      people: [comercial('sp1')],
      clients: [c],
      deals: [
        negocio(c.id, { stage: 'Prospeto' }),
        negocio(c.id, { stage: 'Proposta' }),
        negocio(c.id, { stage: 'Ganho' }),
      ],
    });

    const r = conversionStats(d, new Set(['sp1']));
    expect(r.prospects).toBe(1);
    expect(r.proposals).toBe(1);
    expect(r.won).toBe(1);
  });

  it('conta as fases pós-venda como ganhas', () => {
    // Um negócio em Onboarding já foi ganho — contá-lo como aberto
    // subestimaria a taxa de sucesso do comercial.
    const c = cliente({ salespersonId: 'sp1' });
    const d = dados({
      people: [comercial('sp1')],
      clients: [c],
      deals: [negocio(c.id, { stage: 'Onboarding' }), negocio(c.id, { stage: 'Renovação' })],
    });

    expect(conversionStats(d, new Set(['sp1'])).won).toBe(2);
  });

  it('devolve zeros sem rebentar quando não há negócios', () => {
    const r = conversionStats(dados({ people: [comercial('sp1')] }), new Set(['sp1']));
    expect(r.won).toBe(0);
    expect(r.proposalToWon).toBe(0);
  });
});

describe('qualityStats', () => {
  it('conta os campos em falta', () => {
    const d = dados({
      people: [comercial('sp1')],
      clients: [
        cliente({
          salespersonId: 'sp1',
          phone: '911',
          email: 'a@b.pt',
          nif: '1',
          notes: 'x',
          lat: 1,
          lng: 1,
        }),
        cliente({ salespersonId: 'sp1' }),
      ],
    });

    const r = qualityStats(d, new Set(['sp1']));
    expect(r.total).toBe(2);
    expect(r.noPhone).toBe(1);
    expect(r.noEmail).toBe(1);
    expect(r.completePct).toBe(50);
  });

  it('com spIds nulo olha para a carteira toda', () => {
    const d = dados({
      clients: [cliente({ salespersonId: 'sp1' }), cliente({})],
    });

    expect(qualityStats(d, null).total).toBe(2);
  });

  it('notas só com espaços não contam como preenchidas', () => {
    const d = dados({
      people: [comercial('sp1')],
      clients: [cliente({ salespersonId: 'sp1', notes: '   ' })],
    });

    expect(qualityStats(d, new Set(['sp1'])).noNotes).toBe(1);
  });
});

describe('persistenceStats e timingStats', () => {
  it('a persistência distribui os clientes por número de toques', () => {
    const um = cliente({ salespersonId: 'sp1' });
    const tres = cliente({ salespersonId: 'sp1' });
    const d = dados({
      people: [comercial('sp1')],
      clients: [um, tres],
      activities: [atividade(um.id), atividade(tres.id), atividade(tres.id), atividade(tres.id)],
    });

    const r = persistenceStats(d, new Set(['sp1']));
    expect(r.single).toBe(1);
    expect(r.threePlus).toBe(1);
  });

  it('os tempos não rebentam com carteira vazia', () => {
    expect(() =>
      timingStats(dados({ people: [comercial('sp1')] }), new Set(['sp1'])),
    ).not.toThrow();
  });
});

describe('channelStats — "melhor dia" só com sinal real', () => {
  /**
   * Com poucos dados, os empates decidiam-se pela ordem de inserção no `Map` e
   * os quatro canais mostravam "Domingo". Uma métrica sem sinal tem de dizer
   * que não tem sinal, não inventar um padrão com ar de conclusão.
   */
  function comSucessos(dias: string[]) {
    const c = cliente({ salespersonId: 'sp1' });
    return dados({
      people: [comercial('sp1')],
      clients: [c],
      deals: [negocio(c.id, { stage: 'Ganho' })],
      activities: dias.map((d) => atividade(c.id, { type: 'Telefonema', date: d })),
    });
  }

  it('não afirma dia nenhum abaixo do mínimo de amostra', () => {
    // 4 sucessos, todos à segunda-feira: padrão perfeito, amostra insuficiente.
    const d = comSucessos(['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22']);
    const tel = channelStats(d, new Set(['sp1'])).find((x) => x.type === 'Telefonema')!;

    expect(tel.successful).toBe(4);
    expect(tel.bestDay).toBeNull();
  });

  it('não afirma dia nenhum quando há empate', () => {
    // 6 sucessos: 3 à segunda, 3 à terça. Amostra chega, vantagem não existe.
    const d = comSucessos([
      '2026-06-01',
      '2026-06-08',
      '2026-06-15',
      '2026-06-02',
      '2026-06-09',
      '2026-06-16',
    ]);
    const tel = channelStats(d, new Set(['sp1'])).find((x) => x.type === 'Telefonema')!;

    expect(tel.successful).toBe(6);
    expect(tel.bestDay).toBeNull();
  });

  it('afirma o dia quando há amostra e vantagem clara', () => {
    const d = comSucessos([
      '2026-06-01',
      '2026-06-08',
      '2026-06-15',
      '2026-06-22', // 4 segundas
      '2026-06-02', // 1 terça
    ]);
    const tel = channelStats(d, new Set(['sp1'])).find((x) => x.type === 'Telefonema')!;

    expect(tel.successful).toBe(5);
    expect(tel.bestDay).toBe('Segunda');
  });
});
