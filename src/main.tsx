import {StrictMode} from 'react';
import {RenderMeter} from './components/RenderProbe';
import {createRoot} from 'react-dom/client';
import './index.css';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import { WorkspacePreviewShell } from './workspaces/WorkspacePreviewShell.tsx';
import {initializeFleetWorkspace,fleetReturnUrl} from './lib/fleetWorkspace';

const root=createRoot(document.getElementById('root')!);
void initializeFleetWorkspace().then(()=>root.render(
  <StrictMode>
    <ErrorBoundary>
      <WorkspacePreviewShell />
      <RenderMeter />
    </ErrorBoundary>
  </StrictMode>,
)).catch(()=>root.render(<main style={{padding:40}}><h1>Site workspace access required</h1><p>Your Fleet session ended, or this workspace is unavailable. No command was sent by this page.</p><a href={fleetReturnUrl(window.location)}>Return to Fleet sign-in</a></main>));
