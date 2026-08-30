import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { Briefing, Silence } from '../types';

/**
 * "Hoje" — briefing diário + custo do silêncio.
 *
 * Duas coisas que nenhum dos Top 5 tem:
 *  · um ecrã de abertura que diz o que fazer hoje, em vez de um dashboard
 *    de métricas que ninguém aciona;
 *  · o valor do pipeline que está a arrefecer por falta de contacto —
 *    os 5 mostram o pipeline, nenhum mostra o que está parado.
 */

const eur = (n: number) => `€${Math.round(n).toLocaleString('pt-PT')}`;

export default function HojePage() {
  const navigate = useNavigate();
  const [b, setB] = useState<Briefing | null>(null);
  const [s, setS] = useState<Silence | null>(null);

  useEffect(() => {
    // Via `api`, para o token seguir no pedido. Com `fetch` cru isto recebia
    // 401 e o corpo de erro era guardado como se fossem dados.
    api.insights.briefing().then(setB).catch(console.error);
    api.insights.silence().then(setS).catch(console.error);
  }, []);

  const hoje = new Date().toLocaleDateString('pt-PT', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });

  function open(id: string) {
    navigate(`/clientes/${id}`);
  }

  return (
    <div className="crm-page">
      <div className="crm-page-head">
        <div>
          <h1 style={{ textTransform: 'capitalize' }}>{hoje}</h1>
          <p>O que precisa da tua atenção hoje</p>
        </div>
      </div>

      {/* ── Custo do silêncio: o número que nenhum CRM mostra ── */}
      {s && s.total > 0 && (
        <div className="crm-silence">
          <div className="crm-silence-main">
            <div className="crm-silence-lbl">Pipeline a arrefecer</div>
            <div className="crm-silence-val">{eur(s.total)}</div>
            <div className="crm-silence-sub">
              {s.count} {s.count === 1 ? 'cliente' : 'clientes'} com negócio aberto e sem contacto
              há mais de 30 dias
            </div>
          </div>
          <div className="crm-silence-buckets">
            <div className="crm-silence-bucket b30">
              <div className="crm-silence-bval">{eur(s.buckets['30'])}</div>
              <div className="crm-silence-blbl">30–60 dias</div>
            </div>
            <div className="crm-silence-bucket b60">
              <div className="crm-silence-bval">{eur(s.buckets['60'])}</div>
              <div className="crm-silence-blbl">60–90 dias</div>
            </div>
            <div className="crm-silence-bucket b90">
              <div className="crm-silence-bval">{eur(s.buckets['90'])}</div>
              <div className="crm-silence-blbl">+90 dias ou nunca</div>
            </div>
          </div>
        </div>
      )}

      <div className="crm-hoje-grid">
        <Card title="Agenda de hoje" count={b?.hoje.length}>
          {!b?.hoje.length && <div className="crm-dash-empty">Nada agendado para hoje.</div>}
          {b?.hoje.map((e) => (
            <div key={e.id} className="crm-hoje-row">
              <span className="crm-hoje-time">{e.time}</span>
              <div>
                <div className="crm-hoje-main">{e.title}</div>
                <div className="crm-hoje-sub">
                  {e.clientName || 'sem cliente'} · {e.type}
                </div>
              </div>
            </div>
          ))}
        </Card>

        <Card title="Em atraso" count={b?.atrasados.length} tone="danger">
          {!b?.atrasados.length && (
            <div className="crm-dash-empty">Nada em atraso. Bom trabalho.</div>
          )}
          {b?.atrasados.map((e) => (
            <div key={e.id} className="crm-hoje-row">
              <span className="crm-hoje-time late">{e.date.slice(5).replace('-', '/')}</span>
              <div>
                <div className="crm-hoje-main">{e.title}</div>
                <div className="crm-hoje-sub">
                  {e.clientName || 'sem cliente'} · {e.type}
                </div>
              </div>
            </div>
          ))}
        </Card>

        <Card title="Negócios sem próximo passo" count={b?.semProximoPasso.length} tone="warn">
          {!b?.semProximoPasso.length && (
            <div className="crm-dash-empty">Todos os negócios têm próximo passo.</div>
          )}
          {b?.semProximoPasso.map((c) => (
            <button key={c.id} className="crm-hoje-row link" onClick={() => open(c.id)}>
              <span className="crm-hoje-val">{eur(c.value)}</span>
              <div>
                <div className="crm-hoje-main">{c.name}</div>
                <div className="crm-hoje-sub">
                  {c.days == null ? 'nunca contactado' : `último contacto há ${c.days} d`}
                </div>
              </div>
            </button>
          ))}
        </Card>

        <Card title="A arrefecer" count={b?.arrefecer.length} tone="warn">
          {!b?.arrefecer.length && <div className="crm-dash-empty">Nenhum cliente esquecido.</div>}
          {b?.arrefecer.map((c) => (
            <button key={c.id} className="crm-hoje-row link" onClick={() => open(c.id)}>
              <span className={`crm-hoje-days ${(c.days || 0) > 60 ? 'hot' : ''}`}>{c.days}d</span>
              <div>
                <div className="crm-hoje-main">{c.name}</div>
                <div className="crm-hoje-sub">{c.status}</div>
              </div>
            </button>
          ))}
        </Card>
      </div>

      {s && s.items.length > 0 && (
        <div className="crm-dash-card" style={{ marginTop: 16 }}>
          <div className="crm-dash-title">Onde está o dinheiro parado</div>
          <div className="crm-team-table-wrap" style={{ border: 'none' }}>
            <table className="crm-team-table" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Pipeline</th>
                  <th>Sem contacto</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {s.items.map((i) => (
                  <tr key={i.id} className="crm-team-linkrow" onClick={() => open(i.id)}>
                    <td>
                      <div className="crm-team-namecell">
                        <strong>{i.name}</strong>
                        <span>{i.city || ''}</span>
                      </div>
                    </td>
                    <td>
                      <span className="crm-team-num">{eur(i.value)}</span>
                    </td>
                    <td>
                      <span
                        className="crm-badge-pill"
                        style={{
                          background:
                            (i.days ?? 999) > 90 ? 'var(--c-danger-soft)' : 'var(--c-surface-3)',
                          color: (i.days ?? 999) > 90 ? 'var(--c-danger)' : 'var(--c-muted)',
                        }}
                      >
                        {i.days == null ? 'nunca' : `${i.days} dias`}
                      </span>
                    </td>
                    <td>{i.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count?: number;
  tone?: 'danger' | 'warn';
  children: React.ReactNode;
}) {
  return (
    <div className="crm-dash-card">
      <div className="crm-dash-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{title}</span>
        {count != null && count > 0 && (
          <span className={`crm-hoje-badge ${tone || ''}`}>{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}
