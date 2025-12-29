import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.use(cors());
app.use(express.json());

const categories = [
  { id: 'c1', name: 'كرة القدم' },
  { id: 'c2', name: 'كرة السلة' },
  { id: 'c3', name: 'الجري' },
  { id: 'c4', name: 'اللياقة' },
  { id: 'c5', name: 'معدات وتمرين' }
];

const products = [
  { id: 'p1', name: 'حذاء كرة قدم احترافي', price: 299, image: 'https://placehold.co/200/1f2937/fff?text=Football+Boots', category: 'كرة القدم', rating: 4.7 },
  { id: 'p2', name: 'كرة قدم أصلية FIFA', price: 149, image: 'https://placehold.co/200/0ea5e9/fff?text=Football', category: 'كرة القدم', rating: 4.6 },
  { id: 'p3', name: 'تيشيرت نادي رياضي', price: 99, image: 'https://placehold.co/200/22c55e/fff?text=Jersey', category: 'كرة القدم', rating: 4.3 },
  { id: 'p4', name: 'حذاء جري خفيف', price: 199, image: 'https://placehold.co/200/f59e0b/fff?text=Running+Shoes', category: 'الجري', rating: 4.5 },
  { id: 'p5', name: 'ساعة تتبع اللياقة', price: 249, image: 'https://placehold.co/200/ef4444/fff?text=Fitness+Watch', category: 'اللياقة', rating: 4.4 },
  { id: 'p6', name: 'معدات تمارين مقاومة', price: 129, image: 'https://placehold.co/200/9333ea/fff?text=Resistance+Band', category: 'معدات وتمرين', rating: 4.2 },
  { id: 'p7', name: 'كرة سلة احترافية', price: 159, image: 'https://placehold.co/200/b45309/fff?text=Basketball', category: 'كرة السلة', rating: 4.5 },
  { id: 'p8', name: 'حذاء كرة سلة', price: 279, image: 'https://placehold.co/200/111827/fff?text=Basketball+Shoes', category: 'كرة السلة', rating: 4.6 }
];

let carts = {}; // { sessionId: [{ productId, qty }] }
let reviews = {}; // { productId: [{ sessionId, rating, comment, ts }] }
let wishlists = {}; // { sessionId: [productId, ...] }
let orders = {}; // { sessionId: [{ orderId, total, address, items, ts }] }

app.get('/api/categories', (_req, res) => {
  res.json({ categories });
});

app.get('/api/products', (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const cat = String(req.query.category || '').trim();
  let list = products;
  if (cat) list = list.filter(p => p.category.toLowerCase() === cat.toLowerCase());
  if (q) list = list.filter(p => p.name.toLowerCase().includes(q));
  res.json({ products: list });
});

app.get('/api/products/:id', (req, res) => {
  const id = String(req.params.id || '');
  const p = products.find(x => x.id === id);
  if (!p) return res.status(404).json({ error: 'not_found' });
  const rv = reviews[id] || [];
  res.json({ product: p, reviews: rv });
});

app.post('/api/products/:id/reviews', (req, res) => {
  const id = String(req.params.id || '');
  const { sessionId, rating, comment } = req.body || {};
  const p = products.find(x => x.id === id);
  if (!p) return res.status(404).json({ error: 'not_found' });
  const r = Number(rating);
  const c = String(comment || '').trim();
  if (!sessionId || !r || r < 1 || r > 5 || !c) return res.status(400).json({ error: 'invalid_review' });
  const entry = { sessionId, rating: r, comment: c, ts: Date.now() };
  const cur = reviews[id] || [];
  cur.push(entry);
  reviews[id] = cur;
  res.json({ ok: true, review: entry });
});

app.post('/api/cart', (req, res) => {
  const { sessionId, productId, qty } = req.body || {};
  if (!sessionId || !productId || typeof qty !== 'number') return res.status(400).json({ error: 'missing_fields' });
  const cur = carts[sessionId] || [];
  const idx = cur.findIndex(i => i.productId === productId);
  if (qty <= 0) {
    if (idx >= 0) cur.splice(idx, 1);
  } else {
    if (idx >= 0) cur[idx].qty = qty; else cur.push({ productId, qty });
  }
  carts[sessionId] = cur;
  res.json({ ok: true, cart: cur });
});

app.get('/api/cart', (req, res) => {
  const sessionId = String(req.query.sessionId || '');
  const cur = carts[sessionId] || [];
  const detailed = cur.map(i => ({
    ...i,
    product: products.find(p => p.id === i.productId)
  }));
  res.json({ cart: detailed });
});

app.post('/api/wishlist', (req, res) => {
  const { sessionId, productId, action } = req.body || {};
  if (!sessionId || !productId) return res.status(400).json({ error: 'missing_fields' });
  const cur = wishlists[sessionId] || [];
  const idx = cur.indexOf(productId);
  if (action === 'remove') {
    if (idx >= 0) cur.splice(idx, 1);
  } else {
    if (idx === -1) cur.push(productId);
  }
  wishlists[sessionId] = cur;
  res.json({ ok: true, wishlist: cur });
});

app.get('/api/wishlist', (req, res) => {
  const sessionId = String(req.query.sessionId || '');
  const ids = wishlists[sessionId] || [];
  const items = ids.map(id => products.find(p => p.id === id)).filter(Boolean);
  res.json({ wishlist: items });
});

app.post('/api/orders', (req, res) => {
  const { sessionId, address } = req.body || {};
  const cur = carts[sessionId] || [];
  if (!cur.length) return res.status(400).json({ error: 'empty_cart' });
  const total = cur.reduce((sum, i) => {
    const p = products.find(p => p.id === i.productId);
    return sum + (p ? p.price * i.qty : 0);
  }, 0);
  const order = { orderId: 'order-' + Date.now(), total, address, items: cur.map(i => ({ ...i })), ts: Date.now() };
  carts[sessionId] = [];
  const userOrders = orders[sessionId] || [];
  userOrders.push(order);
  orders[sessionId] = userOrders;
  res.json({ ok: true, orderId: order.orderId, total, address });
});

app.get('/api/orders/history', (req, res) => {
  const sessionId = String(req.query.sessionId || '');
  const list = orders[sessionId] || [];
  res.json({ orders: list });
});
app.post('/api/auth/login', (_req, res) => {
  res.json({ ok: true, token: 'mock-token' });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, '../../frontend');
app.get('/', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});
app.use('/', express.static(frontendDir));

app.get('/health', (_req, res) => {
  res.json({ status: 'OK' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log('Vivos backend listening on http://localhost:' + PORT);
});
