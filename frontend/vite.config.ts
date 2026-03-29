import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // bind to 0.0.0.0 so Docker port mapping works
    proxy: {
      '/api': {
        target: process.env['API_PROXY_TARGET'] ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
