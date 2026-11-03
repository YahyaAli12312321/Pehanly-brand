import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Dev-only: where the PEHANLY backend listens. The browser always talks to
  // the Vite origin (same-origin), so the HttpOnly session cookie just works.
  // 127.0.0.1, not "localhost": Node resolves localhost to ::1 first on many systems, while the API may only
  // listen on IPv4. Override with VITE_DEV_PROXY_TARGET.
  const backend = env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:5000';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      // Never silently move to 3001: the API only trusts the exact origin in CORS_ORIGINS, so a different
      // port would make every write request fail with 403 CORS_ORIGIN_NOT_ALLOWED. Fail loudly instead.
      strictPort: true,
      proxy: {
        '/api': {target: backend, changeOrigin: true},
      },
    },
    preview: {
      port: 3000,
      strictPort: true,
      proxy: {
        '/api': {target: backend, changeOrigin: true},
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.{js,ts}'],
    },
  };
});
