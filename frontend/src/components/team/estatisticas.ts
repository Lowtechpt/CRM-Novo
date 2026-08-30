import type { Client, Salesperson, Activity, Deal, AgendaEvent } from '../../types';
import { OPEN_STAGES, WON_STAGES } from '../../types';

/**
 * Cálculos da página Equipa, separados da apresentação.
 *
 * Estavam dentro do componente, fechados sobre o seu estado: 180 linhas de
 * matemática que não podiam ser testadas sem montar React. Como funções puras
 * sobre `DadosEquipa`, cada métrica é verificável isoladamente — e a página
 * passa a ter só a responsabilidade de desenhar.
 */

export interface DadosEquipa {
  clients: Client[];
  activities: Activity[];
  deals: Deal[];
  agenda: AgendaEvent[];
  people: Salesperson[];
}

/** Sucessos mínimos para afirmar um "melhor dia" sem inventar padrão. */
const MINIMO_AMOSTRA = 5;

export const isWon = (x: Deal) => (WON_STAGES as string[]).includes(x.stage);
export const isOpen = (x: Deal) => (OPEN_STAGES as string[]).includes(x.stage);

/* ── Helpers partilhados pelas várias vistas, por conjunto de comerciais ── */
const clientsOf = (d: DadosEquipa, spIds: Set<string>) =>
  d.clients.filter((c) => c.salespersonId && spIds.has(c.salespersonId));
const activitiesOf = (d: DadosEquipa, spIds: Set<string>) => {
  const ids = new Set(clientsOf(d, spIds).map((c) => c.id));
  return d.activities.filter((a) => ids.has(a.clientId));
};
const dealsOf = (d: DadosEquipa, spIds: Set<string>) => {
  const ids = new Set(clientsOf(d, spIds).map((c) => c.id));
  return d.deals.filter((x) => ids.has(x.clientId));
};

export function channelStats(d: DadosEquipa, spIds: Set<string>) {
  const acts = activitiesOf(d, spIds);
  const types: Activity['type'][] = ['Telefonema', 'Email', 'Reunião', 'Porta Fria'];
  const wonClientIds = new Set(
    dealsOf(d, spIds)
      .filter(isWon)
      .map((d) => d.clientId),
  );
  return types.map((type) => {
    const items = acts.filter((a) => a.type === type);
    const successful = items.filter((a) => wonClientIds.has(a.clientId));
    const dayCount = new Map<string, number>();
    const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    successful.forEach((a) => {
      const d = new Date(`${a.date}T12:00:00`);
      if (!Number.isNaN(d.getTime())) {
        const day = WEEKDAYS[d.getDay()];
        dayCount.set(day, (dayCount.get(day) || 0) + 1);
      }
    });
    /* "Melhor dia" só é afirmado com amostra suficiente e vantagem clara.
       Sem isto, com 9-11 atividades por canal, os empates decidiam-se pela
       ordem de inserção no Map e os quatro canais mostravam "Domingo" — uma
       conclusão implausível apresentada com a mesma confiança de uma real.
       Uma métrica sem sinal deve dizer que não tem sinal. */
    const ordenado = [...dayCount.entries()].sort(
      (a, b) => b[1] - a[1] || WEEKDAYS.indexOf(a[0]) - WEEKDAYS.indexOf(b[0]),
    );
    const [primeiro, segundo] = ordenado;
    const temAmostra = successful.length >= MINIMO_AMOSTRA;
    const temVantagem = primeiro && (!segundo || primeiro[1] > segundo[1]);
    const bestDay = temAmostra && temVantagem ? primeiro : null;
    return {
      type,
      total: items.length,
      successful: successful.length,
      rate: items.length ? Math.round((successful.length / items.length) * 100) : 0,
      bestDay: bestDay ? bestDay[0] : null,
    };
  });
}

export function conversionStats(d: DadosEquipa, spIds: Set<string>) {
  const negocios = dealsOf(d, spIds);
  const stageCount = (stages: string[]) => negocios.filter((x) => stages.includes(x.stage)).length;
  const prospects = stageCount(['Prospeto']);
  const qualified = stageCount(['Contactado']);
  const proposals = stageCount(['Proposta']);
  const negotiating = stageCount(['Negociação']);
  const won = negocios.filter(isWon).length;
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const totalOpenOrWon = prospects + qualified + proposals + negotiating + won;
  return {
    prospects,
    qualified,
    proposals,
    negotiating,
    won,
    prospectToQualified: pct(qualified + proposals + negotiating + won, totalOpenOrWon || 1),
    qualifiedToProposal: pct(
      proposals + negotiating + won,
      qualified + proposals + negotiating + won || 1,
    ),
    proposalToWon: pct(won, proposals + negotiating + won || 1),
  };
}

export function timingStats(d: DadosEquipa, spIds: Set<string>) {
  const cIds = new Set(clientsOf(d, spIds).map((c) => c.id));
  const myClients = clientsOf(d, spIds);
  const myActs = activitiesOf(d, spIds);
  const myDealsWon = dealsOf(d, spIds).filter(isWon);

  // 1º contacto: dias entre criação do cliente e a atividade mais antiga desse cliente
  const firstTouchDays: number[] = [];
  for (const c of myClients) {
    const acts = myActs
      .filter((a) => a.clientId === c.id)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (acts.length) {
      const days = (new Date(acts[0].date).getTime() - new Date(c.createdAt).getTime()) / 86400000;
      if (days >= 0) firstTouchDays.push(days);
    }
  }

  // Intervalo médio entre toques consecutivos, por cliente
  const gapDays: number[] = [];
  for (const c of myClients) {
    const dates = myActs
      .filter((a) => a.clientId === c.id)
      .map((a) => a.date)
      .sort();
    for (let i = 1; i < dates.length; i++) {
      const gap = (new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000;
      if (gap >= 0) gapDays.push(gap);
    }
  }

  // Tempo até ganhar: da criação do cliente até à data prevista (dueDate) do negócio ganho
  const toWinDays: number[] = [];
  for (const d of myDealsWon) {
    if (!cIds.has(d.clientId) || !d.dueDate) continue;
    const client = myClients.find((c) => c.id === d.clientId);
    if (!client) continue;
    const days = (new Date(d.dueDate).getTime() - new Date(client.createdAt).getTime()) / 86400000;
    if (days >= 0) toWinDays.push(days);
  }

  const avg = (arr: number[]) =>
    arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;
  const asDays = (n: number | null) => (n == null ? '—' : `${n} d`);

  return {
    avgFirstTouch: asDays(avg(firstTouchDays)),
    avgTouchGap: asDays(avg(gapDays)),
    avgToWin: asDays(avg(toWinDays)),
    sampleSize: myActs.length,
  };
}

export function persistenceStats(d: DadosEquipa, spIds: Set<string>) {
  const myClients = clientsOf(d, spIds);
  const myActs = activitiesOf(d, spIds);
  const myDealsWon = new Set(
    dealsOf(d, spIds)
      .filter(isWon)
      .map((d) => d.clientId),
  );

  const touchesPerClient = myClients.map((c) => myActs.filter((a) => a.clientId === c.id).length);
  const single = touchesPerClient.filter((n) => n === 1).length;
  const two = touchesPerClient.filter((n) => n === 2).length;
  const threePlus = touchesPerClient.filter((n) => n >= 3).length;

  const touchesToSuccess = myClients
    .filter((c) => myDealsWon.has(c.id))
    .map((c) => myActs.filter((a) => a.clientId === c.id).length)
    .filter((n) => n > 0);
  const touchesOpen = myClients
    .filter((c) => !myDealsWon.has(c.id))
    .map((c) => myActs.filter((a) => a.clientId === c.id).length)
    .filter((n) => n > 0);

  const avg = (arr: number[]) =>
    arr.length ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10 : null;

  return {
    avgTouchesToSuccess: avg(touchesToSuccess),
    avgTouchesOpen: avg(touchesOpen),
    single,
    two,
    threePlus,
  };
}

export function qualityStats(d: DadosEquipa, spIds: Set<string> | null) {
  const list = spIds ? clientsOf(d, spIds) : d.clients;
  const total = list.length || 1;
  const noPhone = list.filter((c) => !c.phone).length;
  const noEmail = list.filter((c) => !c.email).length;
  const noNif = list.filter((c) => !c.nif).length;
  const noNotes = list.filter((c) => !c.notes || !c.notes.trim()).length;
  const noGps = list.filter((c) => c.lat == null || c.lng == null).length;
  const complete = list.filter(
    (c) => c.phone && c.email && c.nif && c.notes?.trim() && c.lat != null,
  ).length;
  return {
    total: list.length,
    noPhone,
    noEmail,
    noNif,
    noNotes,
    noGps,
    completePct: Math.round((complete / total) * 100),
  };
}
