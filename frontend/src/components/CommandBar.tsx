import { useEffect, useMemo, useRef, useState } from 'react';
import type { Client } from '../types';
import { parseCommand, describe, type Command } from '../commands';
import { api } from '../api';
import VoiceInput, { voiceSupported } from './VoiceInput';

/**
 * Barra de comando — escreve ou fala uma frase e o CRM regista.
 * Sem IA: o interpretador é por regras (ver commands.ts).
 *
 * Evita o caminho longo de selecionar cliente → abrir tab → preencher form.
 */

const EXAMPLES = [
  'registar email no cliente Móveis Alentejo a falar sobre a garantia',
  'telefonema para Silva & Irmãos ficaram de enviar orçamento',
  'agendar reunião com TechNova amanhã às 15h',
  'follow-up do Café Costa dia 30',
  'abrir Farmácia Central',
];

interface Props {
  clients: Client[];
  open: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
  onOpenClient: (id: string) => void;
}

export default function CommandBar({ clients, open, onClose, onDone, onOpenClient }: Props) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else {
      setText('');
      setError('');
    }
  }, [open]);

  const cmd: Command | null = useMemo(
    () => (text.trim() ? parseCommand(text, clients) : null),
    [text, clients],
  );

  async function run() {
    if (!cmd || cmd.kind === 'unknown' || saving) return;
    setSaving(true);
    setError('');
    try {
      if (cmd.kind === 'activity') {
        await api.activities.create(cmd.client.id, {
          type: cmd.type,
          date: cmd.date,
          time: cmd.time,
          notes: cmd.notes,
        });
        onDone(`${cmd.type} registado em ${cmd.client.name}`);
      } else if (cmd.kind === 'agenda') {
        await api.agenda.create({
          clientId: cmd.client?.id,
          type: cmd.type,
          title: cmd.title,
          date: cmd.date,
          time: cmd.time,
        });
        onDone(`${cmd.type} agendado para ${cmd.date} ${cmd.time}`);
      } else if (cmd.kind === 'open') {
        onOpenClient(cmd.client.id);
        onDone(`${cmd.client.name}`);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const ok = cmd && cmd.kind !== 'unknown';

  return (
    <div className="crm-cmdk-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="crm-cmdbar">
        <div className="crm-cmdbar-head">
          <span className="crm-cmdbar-ico">⌘</span>
          <span className="crm-cmdbar-title">Comando</span>
          <span className="crm-cmdbar-hint">Escreve ou fala. Enter executa, Esc fecha.</span>
        </div>

        <textarea
          ref={inputRef}
          className="crm-cmdbar-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              run();
            }
            if (e.key === 'Escape') onClose();
          }}
          placeholder="registar email no cliente Móveis Alentejo a falar sobre a garantia"
        />

        <div className="crm-cmdbar-foot">
          {voiceSupported() && <VoiceInput baseText={text} onTranscript={setText} />}
          <div className="crm-cmdbar-spacer" />
          <button className="crm-btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button className="crm-submit" disabled={!ok || saving} onClick={run}>
            {saving ? 'A registar…' : 'Executar'}
          </button>
        </div>

        {/* Pré-visualização do que foi entendido, antes de gravar */}
        {cmd && (
          <div className={`crm-cmdbar-preview ${ok ? 'ok' : 'bad'}`}>
            <div className="crm-cmdbar-preview-lbl">{ok ? 'Vai fazer' : 'Não percebi'}</div>
            <div className="crm-cmdbar-preview-txt">{describe(cmd)}</div>
            {cmd.kind === 'activity' && cmd.notes && (
              <div className="crm-cmdbar-preview-notes">“{cmd.notes}”</div>
            )}
            {cmd.kind === 'agenda' && <div className="crm-cmdbar-preview-notes">“{cmd.title}”</div>}
          </div>
        )}

        {!text.trim() && (
          <div className="crm-cmdbar-examples">
            {EXAMPLES.map((ex) => (
              <button key={ex} className="crm-cmdbar-ex" onClick={() => setText(ex)}>
                {ex}
              </button>
            ))}
          </div>
        )}

        {error && <div className="crm-cmdbar-error">{error}</div>}
      </div>
    </div>
  );
}
