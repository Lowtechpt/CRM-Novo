import { useEffect, useRef, useState } from 'react';

/**
 * Campo com edição inline — padrão Salesforce/Dynamics
 * (INVESTIGACAO/mudanca.md, gap crítico #2: editar sem abrir modal).
 *
 * Clicar no valor transforma-o em input. Enter ou perder o foco grava;
 * Escape cancela.
 */

interface Props {
  label: string;
  value?: string | number;
  placeholder?: string;
  type?: 'text' | 'number' | 'email' | 'tel';
  options?: string[];
  multiline?: boolean;
  onSave: (value: string) => Promise<void>;
}

export default function InlineField({
  label,
  value,
  placeholder = 'Vazio',
  type = 'text',
  options,
  multiline,
  onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    setDraft(String(value ?? ''));
  }, [value]);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  async function commit() {
    if (saving) return;
    const next = draft.trim();
    if (next === String(value ?? '')) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(String(value ?? ''));
    setEditing(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      commit();
    }
  }

  return (
    <div className="crm-inline-row">
      <div className="crm-inline-lbl">{label}</div>

      {!editing ? (
        <div
          className={`crm-inline-val ${!value ? 'empty' : ''}`}
          onClick={() => setEditing(true)}
          title="Clica para editar"
        >
          {value || placeholder}
        </div>
      ) : options ? (
        <select
          ref={ref as React.Ref<HTMLSelectElement>}
          className="crm-inline-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
          disabled={saving}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : multiline ? (
        <textarea
          ref={ref as React.Ref<HTMLTextAreaElement>}
          className="crm-inline-input"
          style={{ minHeight: 80, resize: 'vertical' }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
          disabled={saving}
        />
      ) : (
        <input
          ref={ref as React.Ref<HTMLInputElement>}
          className="crm-inline-input"
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
          disabled={saving}
        />
      )}
    </div>
  );
}
