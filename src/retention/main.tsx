import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Retention from './Retention';
import '../styles.css';
import './retention.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Retention />
  </StrictMode>,
);
