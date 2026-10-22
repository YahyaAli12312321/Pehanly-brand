import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    server: {
      // The Admin Dashboard uses 3000; the website uses 3001 so both can run together. strictPort: never drift
      // to another port, because the API only trusts the exact origins listed in its CORS_ORIGINS.
      port: 3001,
      strictPort: true,
      proxy: { '/api': { target: env.DEV_API_PROXY || 'http://127.0.0.1:5000', changeOrigin: true } },
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'vendor';
            if (/node_modules\/(@tanstack|axios|zustand)\//.test(id)) return 'query';
            return undefined;
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.js'],
      include: ['src/**/*.test.{js,jsx}'],
    },
  };
});
