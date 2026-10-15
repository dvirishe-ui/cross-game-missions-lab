import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import SimApp from './SimApp';
import '../styles.css';
import './sim.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SimApp />
  </StrictMode>,
);
