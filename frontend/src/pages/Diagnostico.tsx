import { useEffect, useState } from 'react';
import { apiFetch } from '../offline';

interface LinhaAcesso {
  email: string;
  ip: string | null;
  agente: string | null;
  entrada_em: string;
  ultima_atividade: string;
  duracao_min: number;
}

/**
 * Só chega aqui quem a Sidebar deixa chegar — ver o filtro por email em
 * App.tsx. O endpoint tem o seu próprio gate (404 a quem não é a conta certa),
 * por isso mesmo alguém a forçar esta vista sem ser essa conta não vê nada.
 */
export default function Diagnostico() {
  const [linhas, setLinhas] = useState<LinhaAcesso[] | null>(null);

  useEffect(() => {
    apiFetch('/diagnostico/acessos')
      .then((d) => setLinhas(d.acessos ?? []))
      .catch(() => setLinhas([]));
  }, []);

  if (!linhas) return null;

  return (
    <div className="crm-page">
      <div className="crm-page-head">
        <div>
          <h1>Acessos</h1>
          <p>Quem entrou, quando, e por quanto tempo esteve ativo.</p>
        </div>
      </div>

      {linhas.length === 0 ? (
        <div className="crm-empty">Ainda sem registos.</div>
      ) : (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>IP</th>
                <th>Agente</th>
                <th>Entrada</th>
                <th>Última atividade</th>
                <th>Duração</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i}>
                  <td className="crm-table-name">{l.email}</td>
                  <td>{l.ip}</td>
                  <td className="crm-acessos-agente" title={l.agente ?? ''}>
                    {l.agente}
                  </td>
                  <td>{l.entrada_em}</td>
                  <td>{l.ultima_atividade}</td>
                  <td>{l.duracao_min} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
