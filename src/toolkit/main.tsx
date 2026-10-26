import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ToolkitApp from './ToolkitApp';
import '../timer/timer.css';
import './toolkit.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToolkitApp />
  </StrictMode>,
);
