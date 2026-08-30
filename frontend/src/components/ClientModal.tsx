import { useEffect, useState } from 'react';
import type { Client, ClientStatus, CallState } from '../types';

const STATUSES: ClientStatus[] = ['Prospeto', 'Contactado', 'Ativo', 'Inativo'];
const CALL_STATES: { id: CallState; label: string }[] = [
  { id: '', label: '— nenhum —' },
  { id: 'no-answer', label: 'Não atendeu' },
  { id: 'vacation', label: 'Férias' },
];

interface Props {
  /** Todos os clientes, para escolher a empresa-mãe. */
  allClients: Client[];
  client: Client | null;
  onClose: () => void;
  onSave: (data: Partial<Client>) => Promise<void>;
  onDelete: () => Promise<void>;
}

const empty: Partial<Client> = {
  name: '',
  nif: '',
  sector: '',
  cae: '',
  status: 'Prospeto',
  contact: '',
  score: 50,
  email: '',
  phone: '',
  website: '',
  address: '',
  city: '',
  notes: '',
  callState: '',
};

export default function ClientModal({ client, allClients, onClose, onSave, onDelete }: Props) {
  const [form, setForm] = useState<Partial<Client>>(client ?? empty);
  const [gps, setGps] = useState(
    client?.lat != null && client?.lng != null ? `${client.lat}, ${client.lng}` : '',
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(client ?? empty);
    setGps(client?.lat != null && client?.lng != null ? `${client.lat}, ${client.lng}` : '');
  }, [client]);

  // Escape fecha o diálogo: é o que qualquer utilizador espera, e para quem
  // navega por teclado era a única forma de sair sem procurar o botão.
  useEffect(() => {
    const sair = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', sair);
    return () => window.removeEventListener('keydown', sair);
  }, [onClose]);

  function set<K extends keyof Client>(key: K, value: Client[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function captureLocation() {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setGps(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`),
      () => alert('Não foi possível obter a localização.'),
    );
  }

  async function handleSave() {
    if (!form.name?.trim()) return;
    setSaving(true);
    try {
      const [latStr, lngStr] = gps.split(',').map((s) => s.trim());
      const lat = latStr ? Number(latStr) : undefined;
      const lng = lngStr ? Number(lngStr) : undefined;
      await onSave({
        ...form,
        lat: Number.isFinite(lat) ? lat : undefined,
        lng: Number.isFinite(lng) ? lng : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="crm-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {/* `role="dialog"` + `aria-modal` para o leitor de ecrã anunciar que o
          resto da página ficou inacessível; `aria-labelledby` dá-lhe um nome. */}
      <div className="crm-modal" role="dialog" aria-modal="true" aria-labelledby="crm-modal-titulo">
        <h3 id="crm-modal-titulo">{client ? 'Editar Cliente' : 'Novo Cliente'}</h3>

        <div className="crm-form-row dual">
          <div className="crm-field">
            <label htmlFor="clientmodal-nif">NIF</label>
            <input
              id="clientmodal-nif"
              value={form.nif || ''}
              onChange={(e) => set('nif', e.target.value)}
              placeholder="Ex: 509442013"
            />
          </div>
          <div className="crm-field">
            <label htmlFor="clientmodal-nome-da-empresa">Nome da empresa *</label>
            <input
              id="clientmodal-nome-da-empresa"
              value={form.name || ''}
              onChange={(e) => set('name', e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="crm-form-row">
          <div className="crm-field">
            <label htmlFor="clientmodal-setor">Setor</label>
            <input
              id="clientmodal-setor"
              value={form.sector || ''}
              onChange={(e) => set('sector', e.target.value)}
            />
          </div>
          <div className="crm-field">
            <label htmlFor="clientmodal-cae">CAE</label>
            <input
              id="clientmodal-cae"
              value={form.cae || ''}
              onChange={(e) => set('cae', e.target.value)}
            />
          </div>
          <div className="crm-field">
            <label htmlFor="clientmodal-estado">Estado</label>
            <select
              id="clientmodal-estado"
              value={form.status || 'Prospeto'}
              onChange={(e) => set('status', e.target.value as ClientStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="crm-form-row">
          <div className="crm-field">
            <label htmlFor="clientmodal-contacto">Contacto</label>
            <input
              id="clientmodal-contacto"
              value={form.contact || ''}
              onChange={(e) => set('contact', e.target.value)}
            />
          </div>
          <div className="crm-field">
            <label htmlFor="clientmodal-score-0-100">Score (0-100)</label>
            <input
              id="clientmodal-score-0-100"
              type="number"
              min={0}
              max={100}
              value={form.score ?? 50}
              onChange={(e) => set('score', Number(e.target.value))}
            />
          </div>
          <div className="crm-field">
            <label htmlFor="clientmodal-agendamento">Agendamento</label>
            <select
              id="clientmodal-agendamento"
              value={form.callState || ''}
              onChange={(e) => set('callState', e.target.value as CallState)}
            >
              {CALL_STATES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="crm-form-row">
          <div className="crm-field">
            <label htmlFor="clientmodal-email">Email</label>
            <input
              id="clientmodal-email"
              type="email"
              value={form.email || ''}
              onChange={(e) => set('email', e.target.value)}
            />
          </div>
          <div className="crm-field">
            <label htmlFor="clientmodal-telefone">Telefone</label>
            <input
              id="clientmodal-telefone"
              value={form.phone || ''}
              onChange={(e) => set('phone', e.target.value)}
            />
          </div>
          <div className="crm-field">
            <label htmlFor="clientmodal-site">Site</label>
            <input
              id="clientmodal-site"
              value={form.website || ''}
              onChange={(e) => set('website', e.target.value)}
            />
          </div>
        </div>

        <div className="crm-form-row dual">
          <div className="crm-field">
            <label htmlFor="clientmodal-morada">Morada</label>
            <input
              id="clientmodal-morada"
              value={form.address || ''}
              onChange={(e) => set('address', e.target.value)}
            />
          </div>
          <div className="crm-field">
            <label htmlFor="clientmodal-localidade">Localidade</label>
            <input
              id="clientmodal-localidade"
              value={form.city || ''}
              onChange={(e) => set('city', e.target.value)}
            />
          </div>
        </div>

        <div className="crm-form-row single">
          <div className="crm-field">
            <label htmlFor="clientmodal-empresa-mae">Empresa-mãe</label>
            <select
              id="clientmodal-empresa-mae"
              value={form.parentId || ''}
              onChange={(e) => set('parentId', e.target.value)}
            >
              <option value="">— nenhuma (empresa independente) —</option>
              {allClients
                .filter((c) => c.id !== client?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="crm-form-row single">
          <div className="crm-field">
            <label htmlFor="clientmodal-gps">Localização (GPS)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="clientmodal-gps"
                value={gps}
                onChange={(e) => setGps(e.target.value)}
                placeholder="40.545512, -8.433774"
              />
              <button type="button" className="crm-btn-outline" onClick={captureLocation}>
                Captar
              </button>
            </div>
          </div>
        </div>

        <div className="crm-form-row single">
          <div className="crm-field">
            <label htmlFor="clientmodal-notas">Notas</label>
            <textarea
              id="clientmodal-notas"
              value={form.notes || ''}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
        </div>

        <div className="crm-modal-footer">
          <button className="crm-btn-outline" onClick={onClose}>
            Cancelar
          </button>
          {client && (
            <button className="crm-btn-outline danger" onClick={onDelete}>
              Eliminar
            </button>
          )}
          <button
            className="crm-submit"
            disabled={saving || !form.name?.trim()}
            onClick={handleSave}
          >
            {saving ? 'A guardar...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
