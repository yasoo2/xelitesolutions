import fs from 'fs';
import path from 'path';

export class Builder {
  static scaffold(
    name: string,
    type: 'ecommerce' | 'saas' | 'blog',
    features: string[] = [],
    baseDir?: string,
    options: { aestheticMode?: string; language?: string; port?: number; overwrite?: boolean } = {}
  ) {
    const root = path.resolve(baseDir || process.cwd(), name);
    if (fs.existsSync(root)) {
      if (options.overwrite) {
        console.log(`[Builder] Overwriting existing project at ${root}`);
        fs.rmSync(root, { recursive: true, force: true });
      } else {
        throw new Error(`Project ${name} already exists`);
      }
    }

    fs.mkdirSync(root, { recursive: true });

    // Core Architecture
    this.createMonorepo(root, name, options);

    // Backend
    this.createBackend(root, features, options);

    // Frontend
    this.createFrontend(root, name, features, options);

    // Infrastructure
    this.createInfra(root, options);

    return { path: root, features, ...options };
  }

  private static createMonorepo(root: string, name: string, options: any = {}) {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      name,
      private: true,
      workspaces: ["apps/*"],
      scripts: {
        "dev": "concurrently \"npm run dev -w apps/api\" \"npm run dev -w apps/web\"",
        "build": "npm install --include=dev && npm run build --workspaces",
        "lint": "eslint .",
        "typecheck": "tsc -p tsconfig.json --noEmit",
        "test": "npm run test -w apps/web && jest"
      },
      devDependencies: {
        "concurrently": "^8.0.0",
        "eslint": "^9.39.2",
        "typescript": "^5.9.3",
        "jest": "^30.2.0",
        "@eslint/js": "^9.0.0",
        "eslint-plugin-react": "^7.37.5",
        "eslint-plugin-react-hooks": "^7.0.1",
        "@typescript-eslint/parser": "^8.11.0",
        "@typescript-eslint/eslint-plugin": "^8.11.0"
      }
    }, null, 2));

    fs.mkdirSync(path.join(root, 'apps'), { recursive: true });

    // TypeScript config (JS-friendly)
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        moduleResolution: "node",
        allowJs: true,
        skipLibCheck: true,
        jsx: "react-jsx",
        noEmit: true
      },
      include: ["apps/**/*", "tests/**/*"]
    }, null, 2));

    fs.writeFileSync(path.join(root, 'eslint.config.cjs'), `
const js = require('@eslint/js');
const reactPlugin = require('eslint-plugin-react');
const reactHooksPlugin = require('eslint-plugin-react-hooks');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
module.exports = [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**', '**/.github/**'] },
  js.configs.recommended,
  {
    files: ['apps/api/**/*.js'],
    linterOptions: { reportUnusedDisableDirectives: true },
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { require: 'readonly', process: 'readonly', console: 'readonly' } },
    rules: {}
  },
  {
    files: ['jest.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { module: 'readonly', require: 'readonly' } },
    rules: {}
  },
  {
    files: ['apps/web/**/*.{js,jsx}'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } }, globals: { console: 'readonly', window: 'readonly', document: 'readonly' } },
    plugins: { react: reactPlugin, 'react-hooks': reactHooksPlugin },
    rules: {
      'no-unused-vars': ['warn', { varsIgnorePattern: '^React$' }],
      'react/no-unknown-property': 'warn',
      'react/jsx-no-duplicate-props': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    },
    settings: { react: { version: 'detect' } }
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { '@typescript-eslint': tsPlugin, react: reactPlugin, 'react-hooks': reactHooksPlugin },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-misused-promises': 'warn',
      'react/no-unknown-property': 'warn',
      'react/jsx-no-duplicate-props': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    },
    settings: { react: { version: 'detect' } }
  },
  {
    files: ['apps/web/**/*.{test,spec}.{js,jsx}'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { test: 'readonly', expect: 'readonly', describe: 'readonly', it: 'readonly', vi: 'readonly' } },
    rules: {}
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { test: 'readonly', expect: 'readonly' } },
    rules: {}
  }
];`.trim());

    // Basic Jest test (smoke)
    const testsDir = path.join(root, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });
    fs.writeFileSync(path.join(testsDir, 'basic.test.js'), `
const fs = require('fs');
test('API index exists', () => {
  expect(fs.existsSync('apps/api/src/index.js')).toBe(true);
});
test('Web App exists', () => {
  expect(fs.existsSync('apps/web/src/App.jsx')).toBe(true);
});
`.trim());
    fs.writeFileSync(path.join(root, 'jest.config.js'), `
module.exports = {
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  testEnvironment: "node"
};`.trim());
  }

  private static createBackend(root: string, features: string[], options: any = {}) {
    const apiRoot = path.join(root, 'apps/api');
    fs.mkdirSync(path.join(apiRoot, 'src'), { recursive: true });

    fs.writeFileSync(path.join(apiRoot, 'package.json'), JSON.stringify({
      name: "api",
      version: "1.0.0",
      scripts: { "dev": "nodemon src/index.js", "build": "echo \"API build skipped\"" },
      dependencies: {
        "express": "^4.18.2",
        "mongoose": "^7.4.0",
        "cors": "^2.8.5",
        "dotenv": "^16.3.1",
        ...(features.includes('auth') ? { "jsonwebtoken": "^9.0.0", "bcryptjs": "^2.4.3" } : {})
      },
      devDependencies: { "nodemon": "^3.0.1" }
    }, null, 2));

    let indexContent = `
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.disable('x-powered-by');
app.use((req, res, next) => {
  const start = Date.now();
  res.once('finish', () => {
    const ms = Date.now() - start;
    console.log(req.method + ' ' + req.originalUrl + ' ' + res.statusCode + ' ' + ms + 'ms');
  });
  next();
});

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/app')
  .then(() => console.log('✅ DB Connected'));

app.get('/', (req, res) => res.json({ status: 'ok' }));
app.get('/api/status', (req, res) => {
  const state = mongoose.connection && mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ ok: true, db: state, uptime: process.uptime(), ts: Date.now() });
});
`;

    if (features.includes('products')) {
      indexContent += `
const Product = mongoose.model('Product', new mongoose.Schema({ name: String, price: Number }));
app.get('/api/products', async (req, res) => res.json(await Product.find()));
`;
    }

    if (features.includes('auth')) {
      indexContent += `
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = mongoose.model('User', new mongoose.Schema({ email: { type: String, unique: true }, password: String }));
const signToken = (u) => jwt.sign({ uid: String(u._id) }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' });

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'missing_fields' });
    const hash = await bcrypt.hash(password, 10);
    const u = await User.create({ email, password: hash });
    return res.json({ ok: true, token: signToken(u) });
  } catch (e) {
    return res.status(400).json({ error: 'register_failed', details: String(e.message || e) });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const u = await User.findOne({ email });
  if (!u) return res.status(401).json({ error: 'invalid_credentials' });
  const ok = await bcrypt.compare(password, u.password);
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
  return res.json({ ok: true, token: signToken(u) });
});
`;
    }

    if (features.includes('cart')) {
      indexContent += `
const Cart = mongoose.model('Cart', new mongoose.Schema({ uid: String, items: [{ productId: String, qty: Number }] }));
app.post('/api/cart', async (req, res) => {
  const { uid, productId, qty } = req.body || {};
  if (!uid || !productId || !qty) return res.status(400).json({ error: 'missing_fields' });
  const c = (await Cart.findOne({ uid })) || (await Cart.create({ uid, items: [] }));
  const i = c.items.find(x => x.productId === productId);
  if (i) i.qty += qty; else c.items.push({ productId, qty });
  await c.save();
  return res.json({ ok: true, cart: c.items });
});
app.get('/api/cart', async (req, res) => {
  const uid = String(req.query.uid || '').trim();
  const c = await Cart.findOne({ uid });
  return res.json({ ok: true, cart: c?.items || [] });
});
`;
    }

    if (features.includes('orders')) {
      indexContent += `
const Order = mongoose.model('Order', new mongoose.Schema({ uid: String, items: [{ productId: String, qty: Number }], total: Number, createdAt: { type: Date, default: Date.now } }));
app.post('/api/orders', async (req, res) => {
  const { uid } = req.body || {};
  const c = await Cart.findOne({ uid });
  if (!c || !c.items.length) return res.status(400).json({ error: 'empty_cart' });
  const total = c.items.reduce((sum, i) => sum + (i.qty * 10), 0);
  const o = await Order.create({ uid, items: c.items, total });
  c.items = []; await c.save();
  return res.json({ ok: true, orderId: String(o._id), total });
});
app.get('/api/orders', async (req, res) => {
  const uid = String(req.query.uid || '').trim();
  const orders = await Order.find({ uid }).sort({ createdAt: -1 }).limit(20);
  return res.json({ ok: true, orders });
});
`;
    }

    indexContent += `\napp.listen(4000, () => console.log('🚀 API on 4000'));`;

    fs.writeFileSync(path.join(apiRoot, 'src/index.js'), indexContent.trim());
  }

  private static createFrontend(root: string, name: string, features: string[], options: any = {}) {
    const webRoot = path.join(root, 'apps/web');
    fs.mkdirSync(path.join(webRoot, 'src'), { recursive: true });
    fs.mkdirSync(path.join(webRoot, 'public'), { recursive: true });

    fs.writeFileSync(path.join(webRoot, 'package.json'), JSON.stringify({
      name: "web",
      version: "1.0.0",
      type: "module",
      scripts: { "dev": "vite --host 0.0.0.0", "build": "vite build", "test": "vitest run" },
      dependencies: { "react": "^18.2.0", "react-dom": "^18.2.0", "axios": "^1.4.0", "lucide-react": "^0.263.1" },
      devDependencies: { "@vitejs/plugin-react": "^4.0.3", "vite": "^4.4.5", "vitest": "^2.1.3", "tailwindcss": "^3.3.3", "autoprefixer": "^10.4.14", "postcss": "^8.4.27" }
    }, null, 2));

    fs.writeFileSync(path.join(webRoot, 'vite.config.js'), `
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: '/preview/${options.port || 5180}/',
  server: { port: ${options.port || 5180}, host: '0.0.0.0', allowedHosts: true, proxy: { '/api': 'http://localhost:4000' } },
  test: { environment: 'node' }
});`);

    const isAr = options.language === 'ar' || options.language === 'dual';
    const lang = isAr ? 'ar' : 'en';
    const dir = isAr ? 'rtl' : 'ltr';

    // Extract proper display title from description or name
    const desc = String(options.description || '').trim();
    let displayTitle = name;
    if (desc && isAr) {
      // Match: متجر + anything after it in Arabic
      const titleMatch = desc.match(/(?:متجر|دكان|محل|موقع|صفحة|تطبيق)\s+([\u0600-\u06FF\s]+)/i);
      if (titleMatch?.[1]) {
        // Clean up prepositions: "للاكياس النايلون" → "اكياس النايلون"
        let cleaned = titleMatch[1].trim()
          .replace(/^لل/, '')      // لل → remove
          .replace(/^لبيع\s*/, '') // لبيع → remove
          .replace(/^ل/, '')       // ل → remove
          .replace(/^ال/, '')      // ال → remove
          .trim();
        displayTitle = 'متجر ' + cleaned;
      } else {
        // Try: "ابني لي متجر حلويات" → capture everything after build verb
        const afterBuild = desc.match(/(?:ابني|انشئ|أنشئ|سوي|اعمل|صمم)\s+(?:لي?\s+)?([\u0600-\u06FF\s]+)/i);
        if (afterBuild?.[1]) displayTitle = afterBuild[1].trim();
      }
    }
    const title = displayTitle;

    const aesthetic = options.aestheticMode || 'corporate';
    const themes: any = {
      glass: `
        --bg: #030712;
        --panel: rgba(17, 24, 39, 0.7);
        --accent: #8b5cf6;
        --accent-glow: rgba(139, 92, 246, 0.5);
        --text: #f9fafb;
        --border: rgba(255, 255, 255, 0.1);
        --blur: blur(12px);
      `,
      neon: `
        --bg: #000000;
        --panel: #0a0a0a;
        --accent: #00ff9f;
        --accent-glow: rgba(0, 255, 159, 0.6);
        --text: #ffffff;
        --border: #00ff9f33;
        --blur: none;
      `,
      minimal: `
        --bg: #ffffff;
        --panel: #fcfcfc;
        --accent: #000000;
        --accent-glow: rgba(0, 0, 0, 0.1);
        --text: #111111;
        --border: #eeeeee;
        --blur: none;
      `,
      corporate: `
        --bg: #f8fafc;
        --panel: #ffffff;
        --accent: #2563eb;
        --accent-glow: rgba(37, 99, 235, 0.2);
        --text: #0f172a;
        --border: #e2e8f0;
        --blur: none;
      `
    };

    const activeTheme = themes[aesthetic] || themes.corporate;

    fs.writeFileSync(path.join(webRoot, 'index.html'), `
<!doctype html>
<html lang="${lang}" dir="${dir}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    ${isAr ? '<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;900&display=swap" rel="stylesheet">' : ''}
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;900&display=swap" rel="stylesheet">
    <style>
      :root {
        ${activeTheme}
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: ${isAr ? "'Cairo', " : ''}'Inter', sans-serif;
        background: var(--bg);
        color: var(--text);
      }
    </style>
  </head>
  <body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body>
</html>`);

    fs.writeFileSync(path.join(webRoot, 'src/main.jsx'), `
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
`);

    const heroTitle = isAr ? displayTitle : `Welcome to ${name}`;
    const heroSub = isAr ? 'اكتشف أفضل المنتجات بأسعار مذهلة' : 'Discover the best products at amazing prices';
    const shopNow = isAr ? 'تسوق الآن' : 'Shop Now';
    const aboutUs = isAr ? 'من نحن' : 'About Us';
    const productsTitle = isAr ? 'منتجاتنا المميزة' : 'Featured Products';
    const addToCart = isAr ? 'أضف للسلة' : 'Add to Cart';
    const contactTitle = isAr ? 'تواصل معنا' : 'Contact Us';
    const footerText = isAr ? `© 2025 ${displayTitle}. جميع الحقوق محفوظة.` : `© 2025 ${name}. All rights reserved.`;
    const currency = isAr ? 'ر.س' : '$';

    fs.writeFileSync(path.join(webRoot, 'src/App.jsx'), `
import React, { useState } from 'react';

const products = [
  { id: 1, name: '${isAr ? 'منتج مميز ١' : 'Premium Product 1'}', price: 99, image: '🛍️' },
  { id: 2, name: '${isAr ? 'منتج مميز ٢' : 'Premium Product 2'}', price: 149, image: '✨' },
  { id: 3, name: '${isAr ? 'منتج مميز ٣' : 'Premium Product 3'}', price: 199, image: '🎁' },
  { id: 4, name: '${isAr ? 'منتج مميز ٤' : 'Premium Product 4'}', price: 79, image: '💎' },
  { id: 5, name: '${isAr ? 'منتج مميز ٥' : 'Premium Product 5'}', price: 129, image: '🌟' },
  { id: 6, name: '${isAr ? 'منتج مميز ٦' : 'Premium Product 6'}', price: 249, image: '🎀' },
];

export default function App() {
  const [cart, setCart] = useState([]);

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const totalItems = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Navbar */}
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 32px', background: 'var(--panel)', borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, zIndex: 50, backdropFilter: 'blur(12px)'
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>${displayTitle}</h2>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <a href="#products" style={{ color: 'var(--text)', textDecoration: 'none', opacity: 0.8 }}>${productsTitle}</a>
          <a href="#contact" style={{ color: 'var(--text)', textDecoration: 'none', opacity: 0.8 }}>${contactTitle}</a>
          <div style={{
            padding: '8px 16px', background: 'var(--accent)', color: '#fff', borderRadius: 8,
            fontSize: 14, fontWeight: 600, cursor: 'pointer'
          }}>🛒 {totalItems}</div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        padding: '80px 32px', textAlign: 'center',
        background: 'linear-gradient(135deg, var(--panel), var(--bg))',
        borderBottom: '1px solid var(--border)'
      }}>
        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 900, marginBottom: 16,
          background: 'linear-gradient(135deg, var(--accent), #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
        }}>${heroTitle}</h1>
        <p style={{ fontSize: 18, opacity: 0.7, marginBottom: 32, maxWidth: 600, margin: '0 auto 32px' }}>${heroSub}</p>
        <a href="#products" style={{
          display: 'inline-block', padding: '14px 40px', background: 'var(--accent)', color: '#fff',
          borderRadius: 12, textDecoration: 'none', fontWeight: 700, fontSize: 16,
          boxShadow: '0 4px 20px var(--accent-glow)', transition: 'transform 0.2s'
        }}>${shopNow}</a>
      </section>

      {/* Products */}
      <section id="products" style={{ padding: '60px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 32, textAlign: 'center' }}>${productsTitle}</h2>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24
        }}>
          {products.map(p => (
            <div key={p.id} style={{
              background: 'var(--panel)', borderRadius: 16, overflow: 'hidden',
              border: '1px solid var(--border)', transition: 'transform 0.2s, box-shadow 0.2s',
              cursor: 'pointer'
            }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 30px var(--accent-glow)'; }}
               onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
              <div style={{
                height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 64, background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(56,189,248,0.1))'
              }}>{p.image}</div>
              <div style={{ padding: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{p.name}</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{p.price} ${currency}</span>
                  <button onClick={() => addToCart(p)} style={{
                    padding: '8px 20px', background: 'var(--accent)', color: '#fff', border: 'none',
                    borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 14
                  }}>${addToCart}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" style={{
        padding: '40px 32px', background: 'var(--panel)', borderTop: '1px solid var(--border)',
        textAlign: 'center', marginTop: 40
      }}>
        <p style={{ opacity: 0.6, fontSize: 14 }}>${footerText}</p>
      </footer>
    </div>
  );
}
`);

    fs.writeFileSync(path.join(webRoot, 'src/App.test.jsx'), `
import { describe, it, expect } from 'vitest';
import App from './App';
describe('App', () => {
  it('exports a component', () => {
    expect(typeof App).toBe('function');
  });
});
`.trim());

    fs.writeFileSync(path.join(webRoot, 'src/index.css'), `@tailwind base;\n@tailwind components;\n@tailwind utilities;`);
    fs.writeFileSync(path.join(webRoot, 'tailwind.config.js'), `export default { content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"], theme: { extend: {} }, plugins: [] }`);
    fs.writeFileSync(path.join(webRoot, 'postcss.config.js'), `export default { plugins: { tailwindcss: {}, autoprefixer: {} } }`);
  }

  private static createInfra(root: string, options: any = {}) {
    fs.writeFileSync(path.join(root, 'docker-compose.yml'), `
version: '3.8'
services:
  mongo:
    image: mongo:latest
    ports: ["27017:27017"]
    volumes: [mongo-data:/data/db]
volumes:
  mongo-data:
`);
    fs.writeFileSync(path.join(root, '.gitignore'), `node_modules\ndist\n.env\n`);
    const wfDir = path.join(root, '.github', 'workflows');
    fs.mkdirSync(wfDir, { recursive: true });
    fs.writeFileSync(path.join(wfDir, 'ci.yml'), `
name: CI
on:
  push:
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run lint --if-present
      - run: npm run typecheck --if-present
      - run: npm test --if-present
      - run: npm run build --if-present
  service-status:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install deps
        run: npm ci
      - name: Start API
        run: |
          node apps/api/src/index.js & echo $! > api.pid
          sleep 2
      - name: Wait for /api/status
        run: |
          ATTEMPTS=0
          until curl -sSf http://localhost:4000/api/status >/tmp/status.json 2>/dev/null || [ $ATTEMPTS -ge 30 ]; do
            ATTEMPTS=$((ATTEMPTS+1))
            echo "waiting ($ATTEMPTS)..."
            sleep 1
          done
          cat /tmp/status.json || true
      - name: Print service status
        run: |
          echo "Service Status:"
          cat /tmp/status.json || echo '{"ok":false}'
      - name: Stop API
        if: always()
        run: |
          PID="$(cat api.pid || echo '')"
          if [ -n "$PID" ]; then
            kill $PID || true
          fi
`.trim());
  }
}
