import { createContext, useContext } from 'react';
import type { Scenario } from '../math/campaign';
import type { StoredState } from './scenarios';

export interface AppApi {
  current: Scenario;
  setCurrent: (s: Scenario) => void;
  saved: Scenario[];
  setSaved: (s: Scenario[]) => void;
  observations: StoredState['observations'];
  setObservation: (day: number, field: keyof StoredState['observations'][number], value: string) => void;
  checks: Record<string, boolean>;
  setCheck: (key: string, value: boolean) => void;
  /** Load a scenario into the builder and scroll there. */
  openInBuilder: (s: Scenario, message: string) => void;
  toast: (message: string) => void;
  /** Offer a file: tries a download and keeps a copyable fallback. */
  exportFile: (filename: string, text: string, mime: string) => void;
  openSummary: () => void;
  resetAll: () => void;
}

export const AppContext = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppContext missing');
  return ctx;
}

export function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}
