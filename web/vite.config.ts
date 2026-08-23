import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { Buffer } from 'node:buffer';

const createJson = (res: any, statusCode: number, body: any) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

const createNoContent = (res: any) => {
  res.statusCode = 204;
  res.end();
};

const createApiShim = () => {
  return (_req: any, _res: any, next: any) => next();
};

export default defineConfig({
  plugins: [
    react()
  ],
  server: {
    //  The terminal panel imports the Arabic shaper from `api/src`, because
    //  one implementation under test beats two copies under none. `vite
    //  build` resolves it without help; the DEV server refuses to serve a
    //  file above its root unless told, and the refusal is a blank page, not
    //  a warning. The owner's machine builds and serves `dist`, so this line
    //  protects the case none of us would notice.
    fs: { allow: ['..'] },
    host: '0.0.0.0',
    port: 5001,
    allowedHosts: true,
    proxy: {
      '/api': {
        // [FIX] محاولة الاتصال بـ API على منافذ متعددة
        target: 'http://localhost:5002',
        changeOrigin: true,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('[Vite Proxy] error:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[Vite Proxy] Sending Request:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('[Vite Proxy] Received Response:', proxyRes.statusCode, req.url);
          });
        },
      },
      '/ws': {
        target: 'ws://127.0.0.1:5002',
        ws: true,
      },
      '/artifacts': {
        // [FIX] تغيير المنفذ إلى 8080 (المنفذ الافتراضي للـ API)
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      }
    },
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  build: {
    minify: 'esbuild',
    cssMinify: 'esbuild',
    reportCompressedSize: false,
    rollupOptions: {
      maxParallelFileOps: 1,
      cache: false,
      output: {
        // [FIX] تقسيم الملفات لتحسين الأداء
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['lucide-react', 'framer-motion'],
        }
      }
    },
    sourcemap: false,
    /**
     * The limit exists to protect the FIRST LOAD, and the first load is now
     * 151 kB: the editor moved out of the entry chunk entirely and is fetched
     * only when a code view opens. What remains above 2 MB is that on-demand
     * editor (~2.6 MB, already stripped of every language service and its
     * 7 MB TypeScript worker). Warning on it every build reports a cost that
     * is no longer paid on arrival, so the threshold says what we actually
     * mean — and the day the ENTRY chunk grows, it will speak again.
     */
    chunkSizeWarningLimit: 2800
  }
});
