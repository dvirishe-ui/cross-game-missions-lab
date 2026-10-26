// Projects live in this browser's localStorage, so they survive a refresh.
// Each viewer has their own copy; nothing is shared or sent anywhere.

import { useCallback, useEffect, useState } from 'react';
import { blankProject, normalize, referenceProject, uid, type Project } from './project';

export interface StoreState {
  projects: Project[];
  currentId: string;
}

export const STORE_KEY = 'promo-toolkit/projects';

export function seedState(): StoreState {
  const ref = referenceProject();
  return { projects: [ref], currentId: ref.id };
}

export function loadStore(storage: Pick<Storage, 'getItem'> | null = safeStorage()): StoreState {
  try {
    const raw = storage?.getItem(STORE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as StoreState;
    const projects = (parsed.projects ?? []).map(normalize);
    if (!projects.length) return seedState();
    return { projects, currentId: projects.some((p) => p.id === parsed.currentId) ? parsed.currentId : projects[0].id };
  } catch {
    return seedState();
  }
}

export function saveStore(s: StoreState, storage: Pick<Storage, 'setItem'> | null = safeStorage()) {
  try {
    storage?.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: changes last for this visit */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

// Pure state changes, kept outside React so they can be tested.
export const actions = {
  update(s: StoreState, fn: (p: Project) => Project): StoreState {
    return { ...s, projects: s.projects.map((p) => (p.id === s.currentId ? { ...fn(p), updatedAt: Date.now() } : p)) };
  },
  create(s: StoreState, from: 'blank' | 'reference', name?: string): StoreState {
    const p = from === 'reference' ? referenceProject() : blankProject(name);
    if (name) p.promo.name = name;
    return { projects: [...s.projects, p], currentId: p.id };
  },
  duplicate(s: StoreState, id: string): StoreState {
    const src = s.projects.find((p) => p.id === id);
    if (!src) return s;
    const copy: Project = { ...structuredClone(src), id: uid(), updatedAt: Date.now() };
    copy.promo.name = `${src.promo.name || 'Untitled'} (copy)`;
    return { projects: [...s.projects, copy], currentId: copy.id };
  },
  rename(s: StoreState, id: string, name: string): StoreState {
    return { ...s, projects: s.projects.map((p) => (p.id === id ? { ...p, promo: { ...p.promo, name }, updatedAt: Date.now() } : p)) };
  },
  remove(s: StoreState, id: string): StoreState {
    const rest = s.projects.filter((p) => p.id !== id);
    if (!rest.length) {
      const b = blankProject();
      return { projects: [b], currentId: b.id };
    }
    return { projects: rest, currentId: s.currentId === id ? rest[0].id : s.currentId };
  },
  open(s: StoreState, id: string): StoreState {
    return s.projects.some((p) => p.id === id) ? { ...s, currentId: id } : s;
  },
};

export function useProjects() {
  const [state, setState] = useState<StoreState>(() => loadStore());
  useEffect(() => {
    const t = setTimeout(() => saveStore(state), 150);
    return () => clearTimeout(t);
  }, [state]);
  const current = state.projects.find((p) => p.id === state.currentId) ?? state.projects[0];
  const update = useCallback((fn: (p: Project) => Project) => setState((s) => actions.update(s, fn)), []);
  return {
    state,
    current,
    update,
    create: (from: 'blank' | 'reference', name?: string) => setState((s) => actions.create(s, from, name)),
    duplicate: (id: string) => setState((s) => actions.duplicate(s, id)),
    rename: (id: string, name: string) => setState((s) => actions.rename(s, id, name)),
    remove: (id: string) => setState((s) => actions.remove(s, id)),
    open: (id: string) => setState((s) => actions.open(s, id)),
  };
}
