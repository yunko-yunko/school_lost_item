import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const localServer = {
  host: '127.0.0.1',
  port: 5173,
  strictPort: true,
  proxy: { '/api': 'http://127.0.0.1:3001' },
};

export default defineConfig({
  plugins: [react()],
  server: localServer,
  preview: localServer,
});
