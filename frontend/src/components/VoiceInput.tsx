import { useEffect, useRef, useState } from 'react';
import { fixTranscript } from '../voiceFix';

/**
 * Registo por voz — Web Speech API, nativa do browser, sem servidor.
 *
 * A investigação aponta a introdução manual de dados como causa nº1 de
 * abandono dos CRMs: 6h/semana por comercial, menos de 37% usam o sistema
 * (INVESTIGACAO/top5-crms-mundiais.md §4). Nenhum dos 5 líderes resolve isto
 * de forma nativa — falar em vez de escrever ataca a causa diretamente.
 *
 * Suportado em Chrome/Edge; noutros browsers o botão não aparece.
 */

/* A Web Speech API ainda é prefixada e não vem nos tipos do DOM. Declara-se
   aqui só o que este componente usa — descrever a API inteira seria manter
   uma cópia desatualizada de uma especificação que não controlamos. */

interface AlternativaDeReconhecimento {
  transcript: string;
  confidence: number;
}

/** Um resultado é indexável e traz `isFinal`; daí a forma híbrida. */
interface ResultadoDeReconhecimento {
  readonly length: number;
  readonly isFinal: boolean;
  [indice: number]: AlternativaDeReconhecimento;
}

interface ListaDeResultados {
  readonly length: number;
  [indice: number]: ResultadoDeReconhecimento;
}

interface EventoDeResultado {
  readonly resultIndex: number;
  readonly results: ListaDeResultados;
}

interface EventoDeErro {
  readonly error: string;
  readonly message?: string;
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: EventoDeResultado) => void) | null;
  onerror: ((e: EventoDeErro) => void) | null;
  onend: (() => void) | null;
};

/** O construtor vive no `window` sob um de dois nomes, consoante o browser. */
interface JanelaComReconhecimento {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as JanelaComReconhecimento;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export const voiceSupported = () => getRecognitionCtor() !== null;

interface Props {
  /** Chamado com o texto acumulado sempre que há nova transcrição. */
  onTranscript: (text: string) => void;
  /** Texto já existente no campo, para acrescentar em vez de substituir. */
  baseText?: string;
}

export default function VoiceInput({ onTranscript, baseText = '' }: Props) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const baseRef = useRef(baseText);

  useEffect(() => {
    baseRef.current = baseText;
  }, [baseText]);

  useEffect(
    () => () => {
      recRef.current?.stop();
    },
    [],
  );

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      return;
    }

    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError('O teu browser não suporta ditado.');
      return;
    }

    const rec = new Ctor();
    rec.lang = 'pt-PT';
    rec.continuous = true;
    rec.interimResults = true;

    // O texto que já lá estava fica CONGELADO no arranque do ditado.
    // Se fosse lido a cada evento, cada frase reconhecida entrava na base da
    // frase seguinte e o texto repetia-se em cascata.
    const sessionBase = baseRef.current;
    const sep = sessionBase && !sessionBase.endsWith(' ') ? ' ' : '';

    rec.onresult = (e) => {
      // Reconstrói sempre a partir da lista completa. Acumular por
      // e.resultIndex duplicava segmentos já finalizados.
      let final = '';
      let live = '';
      for (let i = 0; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += chunk;
        else live += chunk;
      }
      setInterim(live);
      onTranscript(fixTranscript(sessionBase + sep + final));
    };

    rec.onerror = (e) => {
      setError(
        e.error === 'not-allowed' ? 'Permissão de microfone negada.' : `Erro de ditado: ${e.error}`,
      );
      setListening(false);
    };

    rec.onend = () => {
      setListening(false);
      setInterim('');
    };

    recRef.current = rec;
    setError('');
    setListening(true);
    rec.start();
  }

  if (!voiceSupported()) return null;

  return (
    <>
      <button
        type="button"
        className={`crm-voice-btn ${listening ? 'listening' : ''}`}
        onClick={toggle}
        title={listening ? 'Parar ditado' : 'Ditar (pt-PT)'}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
        </svg>
        <span>{listening ? 'A ouvir…' : 'Ditar'}</span>
      </button>

      {listening && interim && <span className="crm-voice-interim">{interim}</span>}
      {error && <span className="crm-voice-error">{error}</span>}
    </>
  );
}
