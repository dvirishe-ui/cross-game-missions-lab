import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Brief from './Brief';
import '../styles.css';
import './brief.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Brief />
  </StrictMode>,
);
