import type { Salesperson } from '../../types';
import {
  type DadosEquipa,
  channelStats,
  conversionStats,
  timingStats,
  persistenceStats,
  qualityStats,
} from './estatisticas';

/**
 * As cinco vistas analíticas da página Equipa.
 *
 * Estavam em linha no componente da página, que passava das mil linhas com dez
 * separadores, os seus cálculos e todo o JSX no mesmo sítio. Todas dependem
 * apenas dos dados e da lista de comerciais — daí a mesma interface.
 */
export interface PropsVista {
  dados: DadosEquipa;
  people: Salesperson[];
}

export function VistaCanais({ dados, people }: PropsVista) {
  const allIds = new Set(people.map((p) => p.id));
  const overall = channelStats(dados, allIds);
  return (
    <>
      <div className="crm-dash-grid">
        <div className="crm-dash-card">
          <div className="crm-dash-title">Sucesso por canal</div>
          <div className="crm-dash-list">
            {overall.every((c) => c.total === 0) && (
              <div className="crm-dash-empty">Sem atividades registadas.</div>
            )}
            {overall
              .filter((c) => c.total > 0)
              .map((c) => (
                <div key={c.type} className="crm-dash-row">
                  <span>
                    {c.type}
                    <div className="crm-team-mini">
                      {c.successful} com sucesso em {c.total} registos
                    </div>
                  </span>
                  <strong>{c.rate}%</strong>
                </div>
              ))}
          </div>
        </div>
        <div className="crm-dash-card">
          <div className="crm-dash-title">Melhor dia por canal</div>
          <div className="crm-dash-list">
            {overall
              .filter((c) => c.bestDay)
              .map((c) => (
                <div key={c.type} className="crm-dash-row">
                  <span>{c.type}</span>
                  <strong>{c.bestDay}</strong>
                </div>
              ))}
            {overall.every((c) => !c.bestDay) && (
              <div className="crm-dash-empty">Sem contactos bem-sucedidos suficientes.</div>
            )}
          </div>
        </div>
      </div>
      <div className="crm-team-table-wrap">
        <table className="crm-team-table">
          <thead>
            <tr>
              <th>Comercial</th>
              <th>Telefonema</th>
              <th>Email</th>
              <th>Reunião</th>
              <th>Melhor canal</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const s = channelStats(dados, new Set([p.id]));
              const best = [...s].sort((a, b) => b.rate - a.rate)[0];
              return (
                <tr key={p.id}>
                  <td>
                    <div className="crm-team-namecell">
                      <strong>{p.name}</strong>
                      <span>{p.role || ''}</span>
                    </div>
                  </td>
                  {s.map((c) => (
                    <td key={c.type}>
                      <span className="crm-team-num">{c.total}</span>
                      {c.total > 0 && <span className="crm-team-mini"> ({c.rate}%)</span>}
                    </td>
                  ))}
                  <td>{best && best.total > 0 ? best.type : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function VistaConversao({ dados, people }: PropsVista) {
  const allIds = new Set(people.map((p) => p.id));
  const overall = conversionStats(dados, allIds);
  return (
    <>
      <div className="crm-dash-grid">
        <div className="crm-dash-card">
          <div className="crm-dash-title">Funil da equipa</div>
          <div className="crm-dash-list">
            <div className="crm-dash-row">
              <span>Prospeção → Qualificação</span>
              <strong>{overall.prospectToQualified}%</strong>
            </div>
            <div className="crm-dash-row">
              <span>Qualificação → Proposta</span>
              <strong>{overall.qualifiedToProposal}%</strong>
            </div>
            <div className="crm-dash-row">
              <span>Proposta → Ganho</span>
              <strong>{overall.proposalToWon}%</strong>
            </div>
          </div>
        </div>
        <div className="crm-dash-card">
          <div className="crm-dash-title">Volumes por estágio</div>
          <div className="crm-dash-list">
            <div className="crm-dash-row">
              <span>Prospeção</span>
              <strong>{overall.prospects}</strong>
            </div>
            <div className="crm-dash-row">
              <span>Qualificação</span>
              <strong>{overall.qualified}</strong>
            </div>
            <div className="crm-dash-row">
              <span>Proposta</span>
              <strong>{overall.proposals}</strong>
            </div>
            <div className="crm-dash-row">
              <span>Negociação</span>
              <strong>{overall.negotiating}</strong>
            </div>
            <div className="crm-dash-row">
              <span>Ganhos</span>
              <strong>{overall.won}</strong>
            </div>
          </div>
        </div>
      </div>
      <div className="crm-team-table-wrap">
        <table className="crm-team-table">
          <thead>
            <tr>
              <th>Comercial</th>
              <th>Prospeção</th>
              <th>Qualificação</th>
              <th>Proposta</th>
              <th>Ganhos</th>
              <th>Proposta → Ganho</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const s = conversionStats(dados, new Set([p.id]));
              return (
                <tr key={p.id}>
                  <td>
                    <div className="crm-team-namecell">
                      <strong>{p.name}</strong>
                      <span>{p.role || ''}</span>
                    </div>
                  </td>
                  <td>
                    <span className="crm-team-num">{s.prospects}</span>
                  </td>
                  <td>
                    <span className="crm-team-num">{s.qualified}</span>
                  </td>
                  <td>
                    <span className="crm-team-num">{s.proposals}</span>
                  </td>
                  <td>
                    <span className="crm-team-num">{s.won}</span>
                  </td>
                  <td>
                    <span className="crm-team-num">{s.proposalToWon}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function VistaTempos({ dados, people }: PropsVista) {
  const allIds = new Set(people.map((p) => p.id));
  const overall = timingStats(dados, allIds);
  return (
    <>
      <div className="crm-dash-grid">
        <div className="crm-dash-card">
          <div className="crm-dash-title">Tempos da equipa</div>
          <div className="crm-dash-list">
            <div className="crm-dash-row">
              <span>1º contacto médio (desde criação do cliente)</span>
              <strong>{overall.avgFirstTouch}</strong>
            </div>
            <div className="crm-dash-row">
              <span>Intervalo médio entre toques</span>
              <strong>{overall.avgTouchGap}</strong>
            </div>
            <div className="crm-dash-row">
              <span>Tempo médio até ganhar</span>
              <strong>{overall.avgToWin}</strong>
            </div>
          </div>
        </div>
        <div className="crm-dash-card">
          <div className="crm-dash-title">Leitura operacional</div>
          <div className="crm-dash-note">
            Estes tempos ajudam a perceber disciplina de resposta e cadência de follow-up. Amostra:{' '}
            {overall.sampleSize} atividades no total.
          </div>
        </div>
      </div>
      <div className="crm-team-table-wrap">
        <table className="crm-team-table">
          <thead>
            <tr>
              <th>Comercial</th>
              <th>1º contacto</th>
              <th>Gap entre toques</th>
              <th>Até ganhar</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const t = timingStats(dados, new Set([p.id]));
              return (
                <tr key={p.id}>
                  <td>
                    <div className="crm-team-namecell">
                      <strong>{p.name}</strong>
                      <span>{p.role || ''}</span>
                    </div>
                  </td>
                  <td>
                    <span className="crm-team-num">{t.avgFirstTouch}</span>
                  </td>
                  <td>
                    <span className="crm-team-num">{t.avgTouchGap}</span>
                  </td>
                  <td>
                    <span className="crm-team-num">{t.avgToWin}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function VistaPersistencia({ dados, people }: PropsVista) {
  const allIds = new Set(people.map((p) => p.id));
  const overall = persistenceStats(dados, allIds);
  return (
    <>
      <div className="crm-dash-grid">
        <div className="crm-dash-card">
          <div className="crm-dash-title">Persistência da equipa</div>
          <div className="crm-dash-list">
            <div className="crm-dash-row">
              <span>Toques médios até sucesso</span>
              <strong>{overall.avgTouchesToSuccess ?? '—'}</strong>
            </div>
            <div className="crm-dash-row">
              <span>Toques médios em negócios abertos</span>
              <strong>{overall.avgTouchesOpen ?? '—'}</strong>
            </div>
            <div className="crm-dash-row">
              <span>Clientes com 1 toque</span>
              <strong>{overall.single}</strong>
            </div>
            <div className="crm-dash-row">
              <span>Clientes com 3+ toques</span>
              <strong>{overall.threePlus}</strong>
            </div>
          </div>
        </div>
        <div className="crm-dash-card">
          <div className="crm-dash-title">Leitura</div>
          <div className="crm-dash-note">
            Mostra se a equipa insiste o suficiente antes de desistir e quantos toques costuma
            precisar para converter.
          </div>
        </div>
      </div>
      <div className="crm-team-table-wrap">
        <table className="crm-team-table">
          <thead>
            <tr>
              <th>Comercial</th>
              <th>Até sucesso</th>
              <th>Em aberto</th>
              <th>1 toque</th>
              <th>2 toques</th>
              <th>3+ toques</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const s = persistenceStats(dados, new Set([p.id]));
              return (
                <tr key={p.id}>
                  <td>
                    <div className="crm-team-namecell">
                      <strong>{p.name}</strong>
                      <span>{p.role || ''}</span>
                    </div>
                  </td>
                  <td>
                    <span className="crm-team-num">{s.avgTouchesToSuccess ?? '—'}</span>
                  </td>
                  <td>
                    <span className="crm-team-num">{s.avgTouchesOpen ?? '—'}</span>
                  </td>
                  <td>
                    <span className="crm-team-num">{s.single}</span>
                  </td>
                  <td>
                    <span className="crm-team-num">{s.two}</span>
                  </td>
                  <td>
                    <span className="crm-team-num">{s.threePlus}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function VistaQualidade({ dados, people }: PropsVista) {
  const overall = qualityStats(dados, null);
  return (
    <>
      <div className="crm-dash-grid">
        <div className="crm-dash-card">
          <div className="crm-dash-title">Qualidade do registo</div>
          <div className="crm-dash-list">
            <div className="crm-dash-row">
              <span>Clientes sem telefone</span>
              <strong>{overall.noPhone}</strong>
            </div>
            <div className="crm-dash-row">
              <span>Clientes sem email</span>
              <strong>{overall.noEmail}</strong>
            </div>
            <div className="crm-dash-row">
              <span>Clientes sem NIF</span>
              <strong>{overall.noNif}</strong>
            </div>
            <div className="crm-dash-row">
              <span>Clientes sem notas</span>
              <strong>{overall.noNotes}</strong>
            </div>
            <div className="crm-dash-row">
              <span>Clientes sem GPS</span>
              <strong>{overall.noGps}</strong>
            </div>
          </div>
        </div>
        <div className="crm-dash-card">
          <div className="crm-dash-title">Ficha completa</div>
          <div className="crm-kpi-box" style={{ display: 'inline-block' }}>
            <div className="crm-kpi-val">{overall.completePct}%</div>
            <div className="crm-kpi-lbl">dos {overall.total} clientes têm ficha completa</div>
          </div>
        </div>
      </div>
      <div className="crm-team-table-wrap">
        <table className="crm-team-table">
          <thead>
            <tr>
              <th>Comercial</th>
              <th>Clientes</th>
              <th>Sem telefone</th>
              <th>Sem email</th>
              <th>Sem notas</th>
              <th>Ficha completa</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const s = qualityStats(dados, new Set([p.id]));
              return (
                <tr key={p.id}>
                  <td>
                    <div className="crm-team-namecell">
                      <strong>{p.name}</strong>
                      <span>{p.role || ''}</span>
                    </div>
                  </td>
                  <td>
                    <span className="crm-team-num">{s.total}</span>
                  </td>
                  <td>
                    <span className="crm-team-num">{s.noPhone}</span>
                  </td>
                  <td>
                    <span className="crm-team-num">{s.noEmail}</span>
                  </td>
                  <td>
                    <span className="crm-team-num">{s.noNotes}</span>
                  </td>
                  <td>
                    <span className="crm-team-num">{s.completePct}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
