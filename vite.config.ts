import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        simulator: resolve(import.meta.dirname, 'index.html'),
        brief: resolve(import.meta.dirname, 'brief.html'),
        retention: resolve(import.meta.dirname, 'retention.html'),
        timer: resolve(import.meta.dirname, 'last-prize.html'),
      },
    },
  },
  test: { environment: 'node' },
} as never);
