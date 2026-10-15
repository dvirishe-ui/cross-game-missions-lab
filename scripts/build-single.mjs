// Builds the app into ONE self-contained HTML file (dist-single/cross-game-missions-lab.html)
// with CSS and JS inlined, so it can be shared as a single page.
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = join(root, 'dist-single');

await build({
  root,
  configFile: false,
  logLevel: 'warn',
  plugins: [react()],
  build: { outDir, emptyOutDir: true, cssCodeSplit: false, modulePreload: false },
});

const assets = join(outDir, 'assets');
const files = readdirSync(assets);
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');

const html = `<title>Cross-Game Missions Lab</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="SPRIBE internal research tool for cross-game mission design and five-hour timing estimates.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Archivo:wght@600;700;800&display=swap">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>
`;
const out = join(outDir, 'cross-game-missions-lab.html');
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
