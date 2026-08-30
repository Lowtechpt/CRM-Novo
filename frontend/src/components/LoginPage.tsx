import { useEffect, useState } from 'react';
import { login, type AuthUser } from '../auth';

/** Credenciais de demonstração, se o servidor tiver esse modo ligado. */
interface Demo {
  enabled: boolean;
  email?: string;
  password?: string;
}

export default function LoginPage({ onLogin }: { onLogin: (u: AuthUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<Demo>({ enabled: false });

  /* O servidor decide se há demonstração. As credenciais nunca estão no código
     do frontend nem no repositório — vivem só no ambiente de quem faz o deploy. */
  useEffect(() => {
    fetch('/api/auth/demo')
      .then((r) => r.json())
      .then(setDemo)
      .catch(() => setDemo({ enabled: false }));
  }, []);

  async function entrarComoDemo() {
    if (!demo.email || !demo.password || busy) return;
    setBusy(true);
    setError('');
    try {
      onLogin(await login(demo.email, demo.password));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      onLogin(await login(email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crm-login">
      <form className="crm-login-box" onSubmit={submit}>
        <div className="crm-login-brand">
          <div className="crm-side-mark">CRM</div>
          <div>
            <div className="crm-login-title">CRM Vendas</div>
            <div className="crm-login-sub">Gestão comercial</div>
          </div>
        </div>

        <div className="crm-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="crm-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <div className="crm-login-error">{error}</div>}

        <button className="crm-submit" type="submit" disabled={busy || !email || !password}>
          {busy ? 'A entrar…' : 'Entrar'}
        </button>

        {demo.enabled && (
          <>
            <div className="crm-login-sep">
              <span>ou</span>
            </div>
            <button
              type="button"
              className="crm-btn-outline crm-login-demo"
              disabled={busy}
              onClick={entrarComoDemo}
            >
              Explorar em modo demonstração
            </button>
            <div className="crm-login-nota">
              Acesso completo de leitura e escrita. Não permite eliminar registos nem reiniciar os
              dados.
            </div>
          </>
        )}
      </form>
    </div>
  );
}
