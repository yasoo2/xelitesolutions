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
    chunkSizeWarningLimit: 2000
  }
});
