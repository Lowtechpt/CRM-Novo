import { useEffect, useState } from 'react';

/**
 * Verdadeiro em ecrãs estreitos (telemóvel e tablet em retrato).
 *
 * O limiar acompanha o que o CSS já usa (`@media (max-width: 900px)`), para
 * que layout e comportamento mudem no mesmo ponto. Duas definições diferentes
 * de "pequeno" dão janelas de larguras onde a interface se contradiz.
 *
 * Ouve a mudança em vez de ler uma vez: rodar o telemóvel muda a largura sem
 * recarregar a página.
 */
const ESTREITO = '(max-width: 900px)';

export function useEcraPequeno(): boolean {
  const [pequeno, setPequeno] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(ESTREITO).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(ESTREITO);
    const aoMudar = (e: MediaQueryListEvent) => setPequeno(e.matches);
    mq.addEventListener('change', aoMudar);
    setPequeno(mq.matches);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);

  return pequeno;
}
