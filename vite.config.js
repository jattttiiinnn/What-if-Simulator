import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Point the dev server at a real backend by setting VITE_API_BASE,
    // e.g. VITE_API_BASE=http://localhost:8080
  },
});
