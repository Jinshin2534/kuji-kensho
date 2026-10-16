import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5930, strictPort: true, host: true },
  preview: { port: 5930, strictPort: true },
});
