import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const categories = [
  { id: 'c1', name: 'Electronics' },
  { id: 'c2', name: 'Fashion' },
  { id: 'c3', name: 'Home' },
  { id: 'c4', name: 'Beauty' },
  { id: 'c5', name: 'Sports' }
];

const products = [
  { id: 'p1', name: 'Smartphone Pro', price: 499, image: 'https://via.placeholder.com/200', category: 'Electronics', rating: 4.7 },
  { id: 'p2', name: 'Wireless Earbuds', price: 69, image: 'https://via.placeholder.com/200', category: 'Electronics', rating: 4.4 },
  { id: 'p3', name: 'Running Shoes', price: 89, image: 'https://via.placeholder.com/200', category: 'Sports', rating: 4.2 },
  { id: 'p4', name: 'Makeup Kit', price: 39, image: 'https://via.placeholder.com/200', category: 'Beauty', rating: 4.5 },
  { id: 'p5', name: 'Winter Jacket', price: 129, image: 'https://via.placeholder.com/200', category: 'Fashion', rating: 4.1 },
  { id: 'p6', name: 'Vacuum Cleaner', price: 149, image: 'https://via.placeholder.com/200', category: 'Home', rating: 4.3 }
];

let carts = {}; // { sessionId: [{ productId, qty }] }

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

app.post('/api/cart', (req, res) => {
  const { sessionId, productId, qty } = req.body || {};
  if (!sessionId || !productId || !qty) return res.status(400).json({ error: 'missing_fields' });
  const cur = carts[sessionId] || [];
  const idx = cur.findIndex(i => i.productId === productId);
  if (idx >= 0) cur[idx].qty = qty; else cur.push({ productId, qty });
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

app.post('/api/orders', (req, res) => {
  const { sessionId, address } = req.body || {};
  const cur = carts[sessionId] || [];
  if (!cur.length) return res.status(400).json({ error: 'empty_cart' });
  const total = cur.reduce((sum, i) => {
    const p = products.find(p => p.id === i.productId);
    return sum + (p ? p.price * i.qty : 0);
  }, 0);
  carts[sessionId] = [];
  res.json({ ok: true, orderId: 'order-' + Date.now(), total, address });
});

app.post('/api/auth/login', (_req, res) => {
  res.json({ ok: true, token: 'mock-token' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log('Vivos backend listening on http://localhost:' + PORT);
});
