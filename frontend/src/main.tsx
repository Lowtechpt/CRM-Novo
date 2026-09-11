import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { iniciarSync } from './offline';
import './index.css';
import './themes.css';

// A sincronização é ligada explicitamente aqui, e não ao importar offline.ts:
// importar um módulo não deve registar ouvintes globais nem arrancar timers.
iniciarSync();

/* Páginas carregadas a pedido: depois de um deploy, uma página já aberta pede
   pedaços da versão anterior que deixaram de existir e o import falha. Aqui
   recarrega-se uma vez para apanhar a versão nova. A marca em sessionStorage
   evita ciclo se a falha for outra — nesse caso o erro segue para o
   ErrorBoundary, que o mostra. */
const MARCA = 'crm_recarregado_por_modulo';
const INTERVALO = 15_000;

window.addEventListener('vite:preloadError', (e) => {
  // Recarregar no máximo uma vez por janela de tempo: se o pedaço continuar a
  // faltar, o erro segue para o ErrorBoundary em vez de entrar em ciclo.
  const ultima = Number(sessionStorage.getItem(MARCA) || 0);
  if (Date.now() - ultima < INTERVALO) return;

  e.preventDefault();
  sessionStorage.setItem(MARCA, String(Date.now()));
  location.reload();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
