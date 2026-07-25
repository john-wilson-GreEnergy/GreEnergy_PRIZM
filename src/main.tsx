import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import { WorkspacePreviewShell } from './workspaces/WorkspacePreviewShell.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <WorkspacePreviewShell />
    </ErrorBoundary>
  </StrictMode>,
);
