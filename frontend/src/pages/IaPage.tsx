import { useEffect, useRef, useState } from 'react';
import type { Client, Deal, AgendaEvent } from '../types';
import { api } from '../api';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

/** Converte a primeira tabela markdown da resposta em HTML, como no original. */
function parseMarkdownTable(text: string): string | null {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^\s*\|.*\|\s*$/.test(l));
  if (start === -1) return null;
  const block: string[] = [];
  for (let i = start; i < lines.length; i++) {
    if (!/^\s*\|.*\|\s*$/.test(lines[i])) break;
    block.push(lines[i]);
  }
  if (block.length < 2) return null;

  const cells = (row: string) =>
    row
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
  const header = cells(block[0]);
  // a 2ª linha é o separador (---|---), não é dado
  const body = block.slice(2).map(cells);

  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]!);

  return `<table class="crm-team-table">
    <thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

export default function IaPage({ clients }: { clients: Client[] }) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [agenda, setAgenda] = useState<AgendaEvent[]>([]);
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [panelHtml, setPanelHtml] = useState<string | null>(null);
  const msgsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api.deals.list().then(setDeals).catch(console.error);
    api.agenda.list().then(setAgenda).catch(console.error);
  }, []);

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [history]);

  const noAnswer = clients.filter((c) => c.callState === 'no-answer').length;
  const vacation = clients.filter((c) => c.callState === 'vacation').length;
  const pendingFollowups = agenda.filter((a) => a.type === 'Follow-up' && !a.done).length;
  const pipelineValue = deals.filter((d) => d.stage !== 'Perdido').reduce((s, d) => s + d.value, 0);
  // Reuniões marcadas nos próximos 30 dias (só Reunião/Demo, como no original)
  const in30d = new Date();
  in30d.setDate(in30d.getDate() + 30);
  const meetings = agenda.filter(
    (a) =>
      !a.done &&
      ['Reunião', 'Demo'].includes(a.type) &&
      new Date(a.date) >= new Date() &&
      new Date(a.date) <= in30d,
  ).length;

  const stats = [
    { label: 'Clientes', value: clients.length },
    { label: 'Reuniões (30d)', value: meetings },
    { label: 'Não atenderam', value: noAnswer },
    { label: 'Em férias', value: vacation },
    { label: 'Follow-ups pendentes', value: pendingFollowups },
    { label: 'Pipeline ativo', value: `${pipelineValue.toLocaleString('pt-PT')}€` },
  ];

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    const next: Msg[] = [...history, { role: 'user', content: text }];
    setHistory(next);
    setSending(true);

    try {
      // `api.ia` anexa o token e já lança com a mensagem do servidor.
      const data = await api.ia.chat({ scope: 'global', messages: next });
      const reply: string = data.reply || '(sem resposta)';
      setHistory((h) => [...h, { role: 'assistant', content: reply }]);
      const table = parseMarkdownTable(reply);
      if (table) setPanelHtml(table);
    } catch (e) {
      setHistory((h) => [
        ...h,
        {
          role: 'assistant',
          content: `Não consegui contactar a IA: ${e instanceof Error ? e.message : String(e)}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="crm-page" style={{ padding: 20 }}>
      <div className="crm-ia-layout">
        {/* Painel esquerdo: estatísticas + tabelas extraídas das respostas */}
        <div className="crm-ia-panel">
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-text)' }}>
              Painel de análise assistida
            </div>
            <div style={{ fontSize: 12, color: 'var(--c-dim)', marginTop: 2 }}>
              Faz uma pergunta no chat para adaptar esta área com tabelas.
            </div>
          </div>

          <div className="crm-ia-stat-grid">
            {stats.map((s) => (
              <div key={s.label} className="crm-ia-stat">
                <div className="crm-ia-stat-lbl">{s.label}</div>
                <div className="crm-ia-stat-val">{s.value}</div>
              </div>
            ))}
          </div>

          <div
            style={{
              border: '.5px solid var(--c-line)',
              borderRadius: 10,
              padding: 16,
              flex: 1,
              overflowY: 'auto',
              background: '#fff',
            }}
          >
            {panelHtml ? (
              <div
                className="crm-team-table-wrap"
                style={{ border: 'none' }}
                dangerouslySetInnerHTML={{ __html: panelHtml }}
              />
            ) : (
              <div style={{ color: 'var(--c-dim)', fontSize: 12 }}>
                As respostas da IA que incluam tabelas aparecem aqui.
              </div>
            )}
          </div>
        </div>

        {/* Chat */}
        <div className="crm-ia-chat">
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-text)', marginBottom: 10 }}>
            Assistente IA · contexto de toda a carteira
          </div>

          <div className="crm-ia-msgs" ref={msgsRef}>
            {history.length === 0 && (
              <div style={{ color: 'var(--c-dim)', fontSize: 12, padding: '8px 4px' }}>
                Ex: "quais clientes não contacto há mais tempo?", "resume a semana", "faz uma tabela
                do pipeline por fase"
              </div>
            )}
            {history.map((m, i) => (
              <div key={i} className={`crm-ia-bubble ${m.role === 'user' ? 'user' : 'ai'}`}>
                <div>{m.content}</div>
              </div>
            ))}
            {sending && (
              <div className="crm-ia-bubble ai">
                <div>a pensar…</div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Pergunta ao assistente..."
              style={{
                flex: 1,
                border: '.5px solid var(--c-line)',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 13,
              }}
            />
            <button className="crm-submit" disabled={sending || !input.trim()} onClick={send}>
              {sending ? '...' : 'Enviar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
