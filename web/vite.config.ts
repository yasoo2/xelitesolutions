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
      const t = setTimeout(() => controller.abort(), 300);
      try {
        const r = await fetch('http://127.0.0.1:5001/api/health', { signal: controller.signal });
        cachedOk = r.ok;
      } catch {
        cachedOk = false;
      } finally {
        clearTimeout(t);
        inflight = null;
      }
      return cachedOk;
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

import externalGlobals from 'rollup-plugin-external-globals';

export default defineConfig({
  plugins: [
    react()
  ],
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        ws: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:5001',
        ws: true,
      },
      '/artifacts': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      }
    },
    hmr: {
      clientPort: 443
    }
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
      maxParallelFileOps: 1, // Single-threaded to minimize RAM usage during AST-heavy transformation
      cache: false,
      external: [
        '@monaco-editor/react',
        'monaco-editor',
      ],
      plugins: [
        externalGlobals({
          '@monaco-editor/react': 'monaco',
          'monaco-editor': 'monaco',
        })
      ],
      output: {
        // Removed manualChunks vendor strategy to allow Rollup to manage smaller, less memory-intensive chunks
      }
    },
    sourcemap: false,
    chunkSizeWarningLimit: 2000
  }
});
