import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { DraftProvider } from './draft';
import { I18nProvider } from './i18n';
import { registerServiceWorker } from './pwa';
import { SessionProvider } from './session';
import './styles.css';

const container = document.querySelector('#root');
if (!container) throw new Error('Missing #root container');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <SessionProvider>
          <DraftProvider>
            <App />
          </DraftProvider>
        </SessionProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);

registerServiceWorker();
