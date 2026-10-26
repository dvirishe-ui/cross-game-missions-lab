import { useEffect, useState } from 'react';

type Theme = 'auto' | 'light' | 'dark';
const THEME_KEY = 'last-prize-theme';

/** Bright / dark switch. Auto follows the device; the choice is remembered in this browser only. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const v = localStorage.getItem(THEME_KEY);
      return v === 'light' || v === 'dark' ? v : 'auto';
    } catch {
      return 'auto';
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage unavailable: the choice lasts for this visit */
    }
  }, [theme]);
  const options: [Theme, string][] = [
    ['light', 'Bright'],
    ['dark', 'Dark'],
    ['auto', 'Auto'],
  ];
  return (
    <div className="t-theme" role="group" aria-label="Colour theme">
      {options.map(([v, label]) => (
        <button key={v} id={`theme-${v}`} aria-pressed={theme === v} onClick={() => setTheme(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}
