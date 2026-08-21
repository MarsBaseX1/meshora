import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: 'src',
  base: './',
  publicDir: '../public',
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    commonjsOptions: {
      ignore: ['fs', 'path']
    },
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  },
  optimizeDeps: {
    exclude: ['assimpjs']
  },
  worker: {
    format: 'es'
  }
});
