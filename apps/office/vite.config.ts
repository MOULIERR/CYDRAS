import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@cydras/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)) } },
});
