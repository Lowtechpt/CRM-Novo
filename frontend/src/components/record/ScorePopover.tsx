import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import type { ScoreDetalhe } from '../../types';

/**
 * Decomposição do score.
 *
 * O servidor já calculava oito sinais ponderados e devolvia o detalhe de cada
 * um; a interface mostrava só o número final. Um "95" sem explicação é uma
 * afirmação que o comercial não pode verificar nem contestar — e a primeira
 * coisa que ele quer saber é *porquê*, para decidir o que fazer a seguir.
 *
 * Mostrar as parcelas transforma uma pontuação opaca numa lista de ações: se
 * "Interlocutores: 0" vale zero pontos, sabe-se onde ir buscar os que faltam.
 */
export function ScorePopover({ clientId, score }: { clientId: string; score: number }) {
  const [aberto, setAberto] = useState(false);
  const [detalhe, setDetalhe] = useState<ScoreDetalhe | null>(null);
  const [erro, setErro] = useState('');
  const caixa = useRef<HTMLDivElement>(null);

  // Só busca quando abre: a lista de clientes não precisa disto.
  useEffect(() => {
    if (!aberto || detalhe) return;
    api.insights
      .score(clientId)
      .then(setDetalhe)
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)));
  }, [aberto, clientId, detalhe]);

  // Trocar de cliente invalida o que estava carregado.
  useEffect(() => {
    setDetalhe(null);
    setErro('');
    setAberto(false);
  }, [clientId]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fora);
      window.removeEventListener('keydown', escape);
    };
  }, [aberto]);

  return (
    <div className="crm-score-wrap" ref={caixa}>
      <button
        className="crm-score-trigger"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        title="Ver como este score é calculado"
      >
        {score}
        <span className="crm-score-hint">porquê?</span>
      </button>

      {aberto && (
        <div className="crm-score-pop" role="dialog" aria-label="Cálculo do score">
          <div className="crm-score-pop-head">
            <span>Como se chega a {detalhe?.score ?? score}</span>
            <button className="crm-icon-btn" onClick={() => setAberto(false)} aria-label="Fechar">
              ×
            </button>
          </div>

          {erro && <div className="crm-score-erro">{erro}</div>}
          {!detalhe && !erro && <div className="crm-score-vazio">A calcular…</div>}

          {detalhe && (
            <>
              <ul className="crm-score-linhas">
                {detalhe.breakdown.map((b, i) => (
                  <li key={i} className={b.points < 0 ? 'neg' : b.points === 0 ? 'zero' : ''}>
                    <span className="crm-score-lbl">{b.label}</span>
                    <span className="crm-score-det">{b.detail}</span>
                    <span className="crm-score-pts">
                      {b.points > 0 ? '+' : ''}
                      {b.points}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="crm-score-total">
                <span>Total</span>
                <span>{detalhe.score}</span>
              </div>
              <div className="crm-score-nota">
                Recalculado a cada consulta a partir de atividades, negócios, interlocutores, agenda
                e concorrência.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
