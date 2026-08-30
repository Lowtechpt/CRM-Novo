import { useEffect, useState } from 'react';
import type { Client } from '../../types';
import { api } from '../../api';

export function TabNotas({
  client,
  onPatch,
}: {
  client: Client;
  onPatch: (p: Partial<Client>) => Promise<void>;
}) {
  const [value, setValue] = useState(client.notes || '');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setValue(client.notes || '');
  }, [client.id]);

  async function save() {
    await onPatch({ notes: value });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <div className="crm-form-section-title">Notas do cliente</div>
      <div className="crm-field" style={{ marginBottom: 14 }}>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{ minHeight: 240 }}
        />
      </div>
      <button className="crm-submit" onClick={save}>
        {saved ? '✓ Guardado' : 'Guardar notas'}
      </button>
    </>
  );
}

export function TabNoticias({ client }: { client: Client }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  async function search() {
    setLoading(true);
    setError('');
    setResult('');
    try {
      const data = await api.ia.news({
        name: client.name,
        sector: client.sector,
        city: client.city,
      });
      setResult(data.reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="crm-form-section-title">Notícias e sinais de mercado</div>
      <button className="crm-submit" disabled={loading} onClick={search}>
        {loading ? 'A analisar…' : 'Analisar mercado'}
      </button>
      {error && (
        <div className="crm-card" style={{ marginTop: 16, color: 'var(--c-danger)' }}>
          {error}
        </div>
      )}
      {result && (
        <div
          className="crm-card"
          style={{ marginTop: 16, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
        >
          {result}
        </div>
      )}
      {!result && !loading && !error && (
        <div className="crm-empty">
          Contexto de mercado e ganchos de abordagem para este cliente.
        </div>
      )}
    </>
  );
}

export function TabChatIa({ client }: { client: Client }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!input.trim() || busy) return;
    const q = input;
    setInput('');
    setMessages((p) => [...p, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const data = await api.ia.chat({
        scope: 'client',
        clientId: client.id,
        messages: [{ role: 'user', content: q }],
      });
      setMessages((p) => [...p, { role: 'ai', text: data.reply }]);
    } catch (e) {
      setMessages((p) => [
        ...p,
        {
          role: 'ai',
          text: `Erro: ${e instanceof Error ? e.message : String(e)}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="crm-form-section-title">Chat IA · contexto deste cliente</div>
      <div style={{ minHeight: 200, marginBottom: 14 }}>
        {messages.length === 0 && <div className="crm-empty">Pergunta sobre este cliente.</div>}
        {messages.map((m, i) => (
          <div key={i} className={`crm-ia-bubble ${m.role === 'user' ? 'user' : 'ai'}`}>
            <div>{m.text}</div>
          </div>
        ))}
        {busy && (
          <div className="crm-ia-bubble ai">
            <div>a pensar…</div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Escreve a tua pergunta..."
          style={{
            flex: 1,
            padding: '10px 12px',
            border: '.5px solid var(--c-line)',
            borderRadius: 8,
            fontSize: 13,
          }}
        />
        <button className="crm-submit" disabled={busy || !input.trim()} onClick={send}>
          Enviar
        </button>
      </div>
    </>
  );
}
