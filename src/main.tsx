import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@shared/lib/i18n';
import { App } from './app/App';
import { PeekApp } from './app/PeekApp';
import './app/globals.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

const isPeek = new URLSearchParams(window.location.search).get('window') === 'peek';

createRoot(rootEl).render(
  <StrictMode>{isPeek ? <PeekApp /> : <App />}</StrictMode>
);
