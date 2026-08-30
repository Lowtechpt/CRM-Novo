import { useState } from 'react';
import type { Client, Deal, Interlocutor, Competition } from '../../types';
import { eur } from './shared';
import { api } from '../../api';

export function ModCard({
  title,
  count,
  defaultOpen = true,
  action,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`crm-mod-card ${open ? 'open' : ''}`}>
      {/* `div` com role, e não `<button>`: o `action` é ele próprio um botão, e
          um botão dentro de outro é HTML inválido — o browser pode ignorar o
          clique interior e o leitor de ecrã anuncia mal. */}
      <div
        className="crm-mod-head"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        <span className="crm-mod-caret">▶</span>
        <span className="crm-mod-title">{title}</span>
        {count != null && <span className="crm-mod-count">{count}</span>}
        {action && <span onClick={(e) => e.stopPropagation()}>{action}</span>}
      </div>
      {open && <div className="crm-mod-body">{children}</div>}
    </div>
  );
}

export function RelatedColumn({
  client,
  deals,
  competition,
  interlocutors,
  onAdd,
  onRemove,
}: {
  client: Client;
  deals: Deal[];
  competition: Competition[];
  interlocutors: Interlocutor[];
  onAdd: (d: Partial<Interlocutor>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', role: '', phone: '', email: '' });
  const [analysis, setAnalysis] = useState('');
  const [busy, setBusy] = useState(false);
  const copy = (t: string) => navigator.clipboard?.writeText(t);

  async function submit() {
    if (!form.name.trim()) return;
    await onAdd(form);
    setForm({ name: '', role: '', phone: '', email: '' });
    setAdding(false);
  }

  async function analyse() {
    setBusy(true);
    try {
      // O servidor monta o contexto completo a partir da BD: ficha,
      // atividades com notas, negócios, agenda, interlocutores e concorrência.
      const data = await api.ia.chat({
        scope: 'client',
        clientId: client.id,
        messages: [
          {
            role: 'user',
            content:
              'Analisa este cliente em 3 pontos curtos: situação atual, ' +
              'risco principal e próxima ação recomendada. Baseia-te no histórico ' +
              'de atividades e nos negócios concretos.',
          },
        ],
      });
      setAnalysis(data.reply);
    } catch (e) {
      setAnalysis(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ModCard
        title="Interlocutores"
        count={interlocutors.length}
        action={
          <button className="crm-panel-add" onClick={() => setAdding((v) => !v)}>
            +
          </button>
        }
      >
        {adding && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {(['name', 'role', 'phone', 'email'] as const).map((k) => (
              <input
                key={k}
                placeholder={{ name: 'Nome', role: 'Cargo', phone: 'Telefone', email: 'Email' }[k]}
                value={form[k]}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                style={{
                  padding: '6px 8px',
                  border: '.5px solid var(--c-line)',
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
            ))}
            <button
              className="crm-submit"
              style={{ padding: '6px 10px', fontSize: 12 }}
              onClick={submit}
            >
              Guardar
            </button>
          </div>
        )}
        {interlocutors.length === 0 && !adding && (
          <div className="crm-empty" style={{ padding: '6px 0' }}>
            Nenhum.
          </div>
        )}
        {interlocutors.map((i) => (
          <div
            key={i.id}
            style={{ padding: '7px 0', borderBottom: '.5px solid var(--c-line-soft)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="crm-card-name">{i.name}</div>
                {i.role && <div className="crm-card-role">{i.role}</div>}
                {i.phone && (
                  <div className="crm-card-contact">
                    <a className="crm-contact-link" href={`tel:${i.phone.replace(/\s/g, '')}`}>
                      {i.phone}
                    </a>
                    <button className="crm-icon-btn" onClick={() => copy(i.phone!)} title="Copiar">
                      ⧉
                    </button>
                  </div>
                )}
                {i.email && (
                  <div className="crm-card-contact">
                    <a
                      className="crm-contact-link"
                      href={`mailto:${i.email}`}
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {i.email}
                    </a>
                    <button className="crm-icon-btn" onClick={() => copy(i.email!)} title="Copiar">
                      ⧉
                    </button>
                  </div>
                )}
              </div>
              <button className="crm-icon-btn danger" onClick={() => onRemove(i.id)}>
                🗑
              </button>
            </div>
          </div>
        ))}
      </ModCard>

      <ModCard title="Negócios" count={deals.length} defaultOpen={deals.length > 0}>
        {deals.length === 0 && (
          <div className="crm-empty" style={{ padding: '6px 0' }}>
            Nenhum.
          </div>
        )}
        {deals.map((d) => (
          <div
            key={d.id}
            style={{ padding: '7px 0', borderBottom: '.5px solid var(--c-line-soft)' }}
          >
            <div className="crm-card-name">{d.title}</div>
            <div className="crm-card-role">
              {d.stage} · {eur(d.value)}
            </div>
          </div>
        ))}
      </ModCard>

      <ModCard title="Concorrência" count={competition.length} defaultOpen={competition.length > 0}>
        {competition.length === 0 && (
          <div className="crm-empty" style={{ padding: '6px 0' }}>
            Nenhuma.
          </div>
        )}
        {competition.map((k) => (
          <div
            key={k.id}
            style={{ padding: '7px 0', borderBottom: '.5px solid var(--c-line-soft)' }}
          >
            <div className="crm-card-name">{k.competitor}</div>
            <div className="crm-card-role">{k.status}</div>
          </div>
        ))}
      </ModCard>

      <ModCard title="Análise IA">
        <div
          style={{
            fontSize: 12,
            color: analysis ? 'var(--c-text)' : 'var(--c-dim)',
            marginBottom: 10,
            whiteSpace: 'pre-wrap',
            lineHeight: 1.5,
          }}
        >
          {analysis || 'Leitura rápida da situação deste cliente.'}
        </div>
        <button className="crm-ai-btn" disabled={busy} onClick={analyse}>
          {busy ? 'A analisar…' : 'Analisar com IA'}
        </button>
      </ModCard>
    </>
  );
}

/* ══════════ TABS SECUNDÁRIAS ══════════ */
