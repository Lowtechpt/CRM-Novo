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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
