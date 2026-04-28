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
  const makeDevJwt = () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' }), 'utf8').toString('base64');
    const payload = Buffer.from(
      JSON.stringify({
        sub: '000000000000000000000001',
        role: 'OWNER',
        email: 'dev@joe.local',
        name: 'Developer',
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
      }),
      'utf8',
    ).toString('base64');
    return `${header}.${payload}.dev`;
  };

  const devToken = makeDevJwt();
  let lastCheckAt = 0;
  let cachedOk = false;
  let inflight: Promise<boolean> | null = null;

  const check = async () => {
    const now = Date.now();
    if (now - lastCheckAt < 1000) return cachedOk;
    if (inflight) return inflight;
    inflight = (async () => {
      lastCheckAt = now;
      const controller = new AbortController();
      const ports = [5002, 5001, 8080, 5000, 3000];
      for (const port of ports) {
        const t = setTimeout(() => controller.abort(), 2000);
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: controller.signal });
          cachedOk = true;
          clearTimeout(t);
          inflight = null;
          return true;
        } catch {
          clearTimeout(t);
        }
      }
      cachedOk = false;
      inflight = null;
      return false;
    })();
    return inflight;
  };

  return async (req: any, res: any, next: any) => {
    const rawUrl = typeof req?.url === 'string' ? req.url : '';
    const path = rawUrl.split('?')[0] || '';
    if (!path.startsWith('/api/')) return next();

    const ok = await check();
    if (ok) return next();

    res.setHeader('x-joe-api-shim', '1');

    if (path === '/api/webviewClick') return createNoContent(res);
    if (path === '/api/tools/browser_run/execute') return createNoContent(res);
    if (path === '/api/health') return createJson(res, 200, { status: 'OK', db: 0, apiAvailable: false, shim: true });
    if (path === '/api/auth/login') return createJson(res, 200, { token: devToken });
    if (path === '/api/auth/dev') return createJson(res, 200, { token: devToken });
    if (path === '/api/auth/google/config') return createJson(res, 200, { clientId: '', secretConfigured: false, shim: true });
    if (path === '/api/sessions') return createJson(res, 200, []);
    if (path.startsWith('/api/sessions/') && path.endsWith('/history')) return createJson(res, 200, { events: [] });
    if (path === '/api/folders') return createJson(res, 200, []);
    if (path === '/api/workspaces') return createJson(res, 200, []);
    if (path === '/api/servers') return createJson(res, 200, []);
    if (path === '/api/project/tree') return createJson(res, 200, { tree: [] });
    if (path === '/api/project/root') return createJson(res, 200, { path: '', name: 'Local Workspace' });
    if (path === '/api/runs/start') return createJson(res, 503, { error: 'API unavailable (start the API on http://127.0.0.1:5001)' });
    if (path === '/api/runs/verify') return createJson(res, 503, { error: 'API unavailable' });

    return createJson(res, 503, { error: `API unavailable (${path})` });
  };
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
        target: 'http://127.0.0.1:5002',
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
