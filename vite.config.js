import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), lab: resolve(import.meta.dirname, 'lab.html') } },
  },
  worker: { format: 'es' },
});
