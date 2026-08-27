import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@shared/lib/i18n';
import { App } from './app/App';
import './app/globals.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
