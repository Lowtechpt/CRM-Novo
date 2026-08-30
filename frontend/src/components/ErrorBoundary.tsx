import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Rede de segurança da UI. Sem isto, um erro em qualquer componente deixa
 * o ecrã em branco sem explicação — o utilizador não sabe se a app rebentou
 * ou se está a carregar.
 */

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[UI] erro não tratado:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crm-crash">
        <div className="crm-crash-box">
          <div className="crm-crash-title">Alguma coisa correu mal</div>
          <p className="crm-crash-text">
            O ecrã não conseguiu ser desenhado. Os dados guardados não foram afetados — podes
            recarregar e continuar.
          </p>
          <pre className="crm-crash-detail">{error.message}</pre>
          <div className="crm-crash-actions">
            <button className="crm-submit" onClick={() => window.location.reload()}>
              Recarregar
            </button>
            <button className="crm-btn-outline" onClick={() => this.setState({ error: null })}>
              Tentar continuar
            </button>
          </div>
        </div>
      </div>
    );
  }
}
