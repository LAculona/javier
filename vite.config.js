import { defineConfig } from 'vite';

// NO_HMR=1 desactiva la recarga en caliente (útil para pruebas automáticas)
export default defineConfig({
  base: './',
  server: { host: true, port: 5173, hmr: process.env.NO_HMR ? false : true },
  preview: { host: true, port: 4173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0
  }
});
