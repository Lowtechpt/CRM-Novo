import { useEffect, useState } from 'react';
import { subscribe, flush, clearRejected, type SyncState } from '../offline';

function ago(ts: number | null) {
  if (!ts) return 'nunca';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'agora mesmo';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}

export default function SyncIndicator() {
  const [s, setS] = useState<SyncState | null>(null);
  const [, tick] = useState(0);

  useEffect(() => subscribe(setS), []);
  // Faz o "há X min" avançar sem depender de novos eventos.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  if (!s) return null;

  const tone = !s.online ? 'offline' : s.pending > 0 ? 'pending' : 'ok';
  const label = !s.online
    ? 'Sem ligação'
    : s.syncing
      ? 'A sincronizar…'
      : s.pending > 0
        ? `${s.pending} por sincronizar`
        : 'Sincronizado';

  return (
    <div className={`crm-sync crm-sync-${tone}`}>
      <div className="crm-sync-row">
        <span className={`crm-sync-dot ${s.syncing ? 'spin' : ''}`} />
        <span className="crm-sync-label">{label}</span>
      </div>
      <div className="crm-sync-sub">
        {s.pending > 0 && !s.online
          ? 'Guardado neste dispositivo. Envia quando houver rede.'
          : `Última sincronização ${ago(s.lastSync)}`}
      </div>
      {s.pending > 0 && s.online && !s.syncing && (
        <button className="crm-sync-btn" onClick={() => flush()}>
          Sincronizar agora
        </button>
      )}
      {s.lastError && <div className="crm-sync-err">{s.lastError}</div>}

      {/* Alterações que o servidor recusou de vez. Saíram da fila para não
          bloquearem as seguintes, mas o utilizador tem de saber que se
          perderam — o cache otimista mostrou-as como se tivessem sido aceites. */}
      {s.rejected.length > 0 && (
        <div className="crm-sync-rejected">
          <div className="crm-sync-rejected-head">
            {s.rejected.length === 1
              ? '1 alteração recusada'
              : `${s.rejected.length} alterações recusadas`}
          </div>
          <ul className="crm-sync-rejected-list">
            {s.rejected.slice(-3).map((r) => (
              <li key={`${r.at}-${r.path}`}>
                <span className="crm-sync-rejected-alvo">{descrever(r.method, r.collection)}</span>
                <span className="crm-sync-rejected-motivo">{r.motivo}</span>
              </li>
            ))}
          </ul>
          <button className="crm-sync-btn" onClick={() => clearRejected()}>
            Percebi
          </button>
        </div>
      )}
    </div>
  );
}

/** Texto legível para o que foi recusado (o caminho da API não diz nada a ninguém). */
function descrever(method: string, collection: string) {
  const entidade =
    {
      '/clients': 'cliente',
      '/deals': 'negócio',
      '/agenda': 'evento',
      '/salespeople': 'comercial',
      '/competition': 'concorrência',
    }[collection] ?? collection.replace('/', '');

  const verbo = { POST: 'Criar', PUT: 'Editar', DELETE: 'Eliminar' }[method] ?? method;
  return `${verbo} ${entidade}`;
}
