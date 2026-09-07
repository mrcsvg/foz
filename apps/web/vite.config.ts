import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = `http://localhost:${process.env.FOZ_PORT ?? 4321}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': target,
      '/ws': { target: target.replace('http', 'ws'), ws: true },
    },
  },
});
