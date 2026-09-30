import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(() => {
  return {
    define: { __PRIZM_RENDER_PROFILE__: JSON.stringify(process.env.PRIZM_REACT_PROFILE === 'true') },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {input: {workspace: path.resolve(__dirname, 'index.html'), signin: path.resolve(__dirname, 'signin.html'), fleet: path.resolve(__dirname, 'fleet.html')}},
    },
    resolve: {
      alias: {
        ...(process.env.PRIZM_REACT_PROFILE === 'true' ? { 'react-dom/client': 'react-dom/profiling' } : {}),
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: [
          '**/data/**',
          '**/turtle/**',
          '**/*.json',
          '**/*.csv',
          '**/node_modules/**',
          '**/dist/**'
        ],
      },
    },
  };
});
