import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: '/ant-2026/',
  publicDir: 'static',
  build: { rollupOptions: { input: {
    main: fileURLToPath(new URL('index.html', import.meta.url)),
    sketchbook: fileURLToPath(new URL('material-sketchbook.html', import.meta.url))
  } } },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' }
});
