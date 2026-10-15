// Builds each page into ONE self-contained HTML file in dist-single/
// (CSS and JS inlined) so it can be shared as a single page.
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const pages = [
  { html: 'index.html', out: 'missions-simulator.html', title: 'Missions Simulator', description: 'Simulate when the last prize goes in a SPRIBE cross-game mission day.' },
  { html: 'brief.html', out: 'cross-game-missions-brief.html', title: 'Competitor Missions', description: 'How other casino companies run missions: task types, durations and prize pools, with sources.' },
];
mkdirSync(join(root, 'dist-single'), { recursive: true });

for (const page of pages) {
  const outDir = join(root, 'dist-single', `.tmp-${page.out}`);
  await build({
    root,
    configFile: false,
    logLevel: 'warn',
    plugins: [react()],
    build: { outDir, emptyOutDir: true, cssCodeSplit: false, modulePreload: false, rollupOptions: { input: join(root, page.html) } },
  });
  const assets = join(outDir, 'assets');
  const files = readdirSync(assets);
  const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
  const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
  const html = `<title>${page.title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="${page.description}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Archivo:wght@600;700;800&display=swap">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>
`;
  const out = join(root, 'dist-single', page.out);
  writeFileSync(out, html);
  console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
}
