import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = Number(process.env.PORT || 10000);
const host = '0.0.0.0';

const distDir = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : path.resolve(__dirname, 'web', 'dist');

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
]);

function setCommonHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function isProbablyAsset(p) {
  return /\/assets\/|\.css$|\.js$|\.mjs$|\.png$|\.jpe?g$|\.svg$|\.webp$|\.ico$|\.woff2?$|\.ttf$|\.map$/.test(p);
}

async function fileExists(p) {
  try {
    const st = await fs.stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

function safeJoin(root, rel) {
  const clean = rel.replaceAll('\\', '/').replace(/^\/+/, '');
  const resolved = path.resolve(root, clean);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

const server = http.createServer(async (req, res) => {
  try {
    setCommonHeaders(res);

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === '/health') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ status: 'OK' }));
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Method Not Allowed');
      return;
    }

    const relPath = pathname === '/' ? '/index.html' : pathname;
    const absolutePath = safeJoin(distDir, relPath);
    if (!absolutePath) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Bad Request');
      return;
    }

    const exists = await fileExists(absolutePath);
    let toServe = exists ? absolutePath : null;

    if (!toServe) {
      const accept = String(req.headers.accept || '');
      const wantsHtml = accept.includes('text/html') || accept.includes('*/*');
      if (wantsHtml) {
        const indexPath = path.join(distDir, 'index.html');
        if (await fileExists(indexPath)) {
          toServe = indexPath;
        }
      }
    }

    if (!toServe) {
      const hint = `Not Found. Build output missing at ${distDir}`;
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(hint);
      return;
    }

    const ext = path.extname(toServe).toLowerCase();
    res.setHeader('Content-Type', mimeTypes.get(ext) || 'application/octet-stream');

    if (isProbablyAsset(pathname)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }

    if (req.method === 'HEAD') {
      res.statusCode = 200;
      res.end();
      return;
    }

    const data = await fs.readFile(toServe);
    res.statusCode = 200;
    res.end(data);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Internal Server Error');
  }
});

server.listen(port, host, async () => {
  const distExists = await fileExists(path.join(distDir, 'index.html'));
  const msg = {
    port,
    distDir,
    distReady: distExists,
  };
  process.stdout.write(JSON.stringify(msg) + '\n');
});

