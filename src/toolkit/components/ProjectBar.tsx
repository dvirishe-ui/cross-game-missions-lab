// ProjectSelector: switch, create, rename, duplicate and delete promotion projects.

import { useState } from 'react';
import type { Project } from '../model/project';

interface Props {
  projects: Project[];
  current: Project;
  open: (id: string) => void;
  create: (from: 'blank' | 'reference', name?: string) => void;
  duplicate: (id: string) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
}

export function ProjectBar({ projects, current, open, create, duplicate, rename, remove }: Props) {
  const [mode, setMode] = useState<'idle' | 'rename' | 'new' | 'delete'>('idle');
  const [name, setName] = useState('');
  const title = (p: Project) => p.promo.name.trim() || 'Untitled promotion';

  return (
    <div className="k-projectbar">
      <label htmlFor="project-select" className="k-muted">
        Project
      </label>
      {mode === 'rename' ? (
        <form
          className="k-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) rename(current.id, name.trim());
            setMode('idle');
          }}
        >
          <input id="project-rename" autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" />
          <button className="t-btn primary" type="submit">
            Save
          </button>
          <button className="k-link" type="button" onClick={() => setMode('idle')}>
            Cancel
          </button>
        </form>
      ) : mode === 'new' ? (
        <form
          className="k-row"
          onSubmit={(e) => {
            e.preventDefault();
            create('blank', name.trim() || 'New promotion');
            setMode('idle');
          }}
        >
          <input id="project-new-name" autoFocus placeholder="e.g. Halloween Cross-Game Mission" value={name} onChange={(e) => setName(e.target.value)} aria-label="New project name" />
          <button className="t-btn primary" type="submit">
            Create blank
          </button>
          <button
            className="t-btn"
            type="button"
            onClick={() => {
              create('reference', name.trim() || undefined);
              setMode('idle');
            }}
          >
            Copy of SPRIBE Adventure
          </button>
          <button className="k-link" type="button" onClick={() => setMode('idle')}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <select id="project-select" value={current.id} onChange={(e) => open(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {title(p)}
              </option>
            ))}
          </select>
          <button
            className="k-link"
            onClick={() => {
              setName('');
              setMode('new');
            }}
          >
            New
          </button>
          <button
            className="k-link"
            onClick={() => {
              setName(current.promo.name);
              setMode('rename');
            }}
          >
            Rename
          </button>
          <button className="k-link" onClick={() => duplicate(current.id)}>
            Duplicate
          </button>
          {mode === 'delete' ? (
            <span className="k-confirm">
              Delete “{title(current)}”?{' '}
              <button
                className="t-btn danger"
                onClick={() => {
                  remove(current.id);
                  setMode('idle');
                }}
              >
                Delete
              </button>
              <button className="k-link" onClick={() => setMode('idle')}>
                Cancel
              </button>
            </span>
          ) : (
            <button className="k-link danger" onClick={() => setMode('delete')}>
              Delete
            </button>
          )}
          <span className="k-muted k-small k-saved">Saved in this browser</span>
        </>
      )}
    </div>
  );
}
