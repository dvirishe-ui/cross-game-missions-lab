import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import TimerApp from './TimerApp';
import './timer.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TimerApp />
  </StrictMode>,
);
