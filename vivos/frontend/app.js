const API = 'http://localhost:8080/api';
const sessionId = 'sess-' + Math.random().toString(16).slice(2);

const state = { products: [], categories: [], cart: [] };

async function fetchJSON(url) {
  const r = await fetch(url);
  return r.json();
}

async function loadCategories() {
  const data = await fetchJSON(API + '/categories');
  state.categories = data.categories || [];
  const sel = document.getElementById('category');
  sel.innerHTML = '<option value="">كل التصنيفات</option>' + state.categories.map(c => `<option>${c.name}</option>`).join('');
}

async function loadProducts() {
  const q = document.getElementById('search').value.trim();
  const cat = document.getElementById('category').value.trim();
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (cat) params.set('category', cat);
  const data = await fetchJSON(API + '/products?' + params.toString());
  state.products = data.products || [];
  renderProducts();
}

async function loadCart() {
  const data = await fetchJSON(API + '/cart?sessionId=' + encodeURIComponent(sessionId));
  state.cart = data.cart || [];
  renderCart();
}

function renderProducts() {
  const grid = document.getElementById('grid');
  grid.innerHTML = state.products.map(p => `
    <article class="card">
      <img src="${p.image}" alt="${p.name}"/>
      <div class="info">
        <div>${p.name}</div>
        <div class="price">$${p.price}</div>
        <button onclick="addToCart('${p.id}')">أضف للسلة</button>
      </div>
    </article>
  `).join('');
}

async function addToCart(productId) {
  const cur = state.cart.find(i => i.productId === productId);
  const qty = cur ? cur.qty + 1 : 1;
  await fetch(API + '/cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, productId, qty })
  });
  await loadCart();
}

function renderCart() {
  const items = document.getElementById('cartItems');
  const count = state.cart.reduce((n, i) => n + i.qty, 0);
  document.getElementById('cartCount').textContent = count;
  items.innerHTML = state.cart.map(i => {
    const p = i.product;
    return `<div>
      ${p?.name || i.productId} — الكمية: ${i.qty} — السعر: $${p?.price || 0}
    </div>`;
  }).join('');
}

async function checkout() {
  const r = await fetch(API + '/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, address: 'الرياض، المملكة' })
  });
  const data = await r.json();
  const el = document.getElementById('orderStatus');
  if (data.ok) {
    el.textContent = `تم إنشاء الطلب ${data.orderId} — الإجمالي: $${data.total}`;
  } else {
    el.textContent = 'فشل الطلب';
  }
}

function setup() {
  document.getElementById('refresh').addEventListener('click', () => {
    loadProducts();
  });
  document.getElementById('checkout').addEventListener('click', checkout);
}

(async function init() {
  setup();
  await loadCategories();
  await loadProducts();
  await loadCart();
})();
