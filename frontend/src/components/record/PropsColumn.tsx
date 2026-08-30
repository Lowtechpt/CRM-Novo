import type { Client, ClientStatus } from '../../types';
import InlineField from '../InlineField';

export function PropsColumn({
  client,
  allClients,
  onPatch,
}: {
  client: Client;
  allClients: Client[];
  onPatch: (p: Partial<Client>) => Promise<void>;
}) {
  const parent = client.parentId ? allClients.find((c) => c.id === client.parentId) : null;
  const children = allClients.filter((c) => c.parentId === client.id);

  return (
    <>
      <div className="crm-form-section-title">
        Identificação
        <span style={{ textTransform: 'none', fontWeight: 400, letterSpacing: 0 }}>
          {' '}
          · clica num campo para editar
        </span>
      </div>
      <div className="crm-props-grid">
        <InlineField label="NIF" value={client.nif} onSave={(v) => onPatch({ nif: v })} />
        <InlineField label="Setor" value={client.sector} onSave={(v) => onPatch({ sector: v })} />
        <InlineField label="CAE" value={client.cae} onSave={(v) => onPatch({ cae: v })} />
        <InlineField
          label="Estado"
          value={client.status}
          options={['Prospeto', 'Contactado', 'Ativo', 'Inativo']}
          onSave={(v) => onPatch({ status: v as ClientStatus })}
        />
        <InlineField
          label="Score"
          value={client.score}
          type="number"
          onSave={(v) => onPatch({ score: Number(v) || 0 })}
        />
        <InlineField
          label="Contacto"
          value={client.contact}
          onSave={(v) => onPatch({ contact: v })}
        />
        <InlineField
          label="Email"
          value={client.email}
          type="email"
          onSave={(v) => onPatch({ email: v })}
        />
        <InlineField
          label="Telefone"
          value={client.phone}
          type="tel"
          onSave={(v) => onPatch({ phone: v })}
        />
        <InlineField label="Site" value={client.website} onSave={(v) => onPatch({ website: v })} />
        <InlineField
          label="Morada"
          value={client.address}
          onSave={(v) => onPatch({ address: v })}
        />
        <InlineField label="Localidade" value={client.city} onSave={(v) => onPatch({ city: v })} />
        <InlineField
          label="GPS"
          value={client.lat != null && client.lng != null ? `${client.lat}, ${client.lng}` : ''}
          placeholder="40.545512, -8.433774"
          onSave={async (v) => {
            const [la, ln] = v.split(',').map((x) => Number(x.trim()));
            await onPatch({
              lat: Number.isFinite(la) ? la : undefined,
              lng: Number.isFinite(ln) ? ln : undefined,
            });
          }}
        />
      </div>

      {(parent || children.length > 0) && (
        <>
          <div className="crm-form-section-title" style={{ marginTop: 24 }}>
            Estrutura do grupo
          </div>
          {parent && (
            <div className="crm-inline-row">
              <div className="crm-inline-lbl">Mãe</div>
              <div className="crm-inline-val">{parent.name}</div>
            </div>
          )}
          {children.map((c) => (
            <div key={c.id} className="crm-inline-row">
              <div className="crm-inline-lbl">Filial</div>
              <div className="crm-inline-val">{c.name}</div>
            </div>
          ))}
        </>
      )}
    </>
  );
}

/* ══════════ COLUNA 2 — compositor + timeline ══════════ */
