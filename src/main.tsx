import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { SiteDataProvider } from './context/SiteDataContext.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <SiteDataProvider>
        <App />
      </SiteDataProvider>
    </ErrorBoundary>
  </StrictMode>,
);
