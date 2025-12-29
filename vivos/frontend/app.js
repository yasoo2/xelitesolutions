const API = location.origin + '/api';
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
      <img src="${p.image}" alt="${p.name}" onclick="openProduct('${p.id}')"/>
      <div class="info">
        <div onclick="openProduct('${p.id}')">${p.name}</div>
        <div class="price">$${p.price}</div>
        <div class="rating">التقييم: ${'★'.repeat(Math.round(p.rating || 0))}</div>
        <button onclick="addToCart('${p.id}')">أضف للسلة</button>
        <button onclick="toggleWishlist('${p.id}')">أضف للمفضلة</button>
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

async function setQty(productId, qty) {
  await fetch(API + '/cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, productId, qty })
  });
  await loadCart();
}

async function removeItem(productId) {
  await setQty(productId, 0);
}

async function toggleWishlist(productId) {
  const wl = await fetchJSON(API + '/wishlist?sessionId=' + encodeURIComponent(sessionId));
  const ids = (wl.wishlist || []).map(x => x.id);
  const action = ids.includes(productId) ? 'remove' : 'add';
  await fetch(API + '/wishlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, productId, action })
  });
  await loadWishlist();
}

async function loadWishlist() {
  const wl = await fetchJSON(API + '/wishlist?sessionId=' + encodeURIComponent(sessionId));
  const el = document.getElementById('wishlist');
  if (el) {
    el.innerHTML = (wl.wishlist || []).map(p => `<div>${p.name}</div>`).join('');
  }
}

function renderCart() {
  const items = document.getElementById('cartItems');
  const count = state.cart.reduce((n, i) => n + i.qty, 0);
  document.getElementById('cartCount').textContent = count;
  items.innerHTML = state.cart.map(i => {
    const p = i.product;
    return `<div class="cart-item">
      <span>${p?.name || i.productId}</span>
      <span>الكمية: ${i.qty}</span>
      <span>$${p?.price || 0}</span>
      <button onclick="setQty('${i.productId}', ${i.qty + 1})">+</button>
      <button onclick="setQty('${i.productId}', ${i.qty - 1})" ${i.qty <= 1 ? 'disabled' : ''}>-</button>
      <button onclick="removeItem('${i.productId}')">إزالة</button>
    </div>`;
  }).join('');
}

async function openProduct(id) {
  const data = await fetchJSON(API + '/products/' + encodeURIComponent(id));
  const p = data.product;
  const rv = data.reviews || [];
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="panel">
      <h3>${p.name}</h3>
      <img src="${p.image}" alt="${p.name}" style="width:100%;height:200px;object-fit:cover"/>
      <div>السعر: $${p.price}</div>
      <div>التقييم: ${'★'.repeat(Math.round(p.rating || 0))}</div>
      <h4>المراجعات</h4>
      <div>${rv.map(r => `<div>★${r.rating} — ${r.comment}</div>`).join('') || 'لا توجد مراجعات'}</div>
      <h4>أضف مراجعة</h4>
      <label>التقييم</label>
      <select id="rv_rating"><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select>
      <label>تعليق</label>
      <textarea id="rv_comment" rows="3" style="width:100%"></textarea>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button id="rv_submit">إرسال</button>
        <button id="rv_close">إغلاق</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('rv_close').onclick = () => { document.body.removeChild(modal); };
  document.getElementById('rv_submit').onclick = async () => {
    const rating = Number(document.getElementById('rv_rating').value);
    const comment = String(document.getElementById('rv_comment').value).trim();
    await fetch(API + '/products/' + encodeURIComponent(id) + '/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, rating, comment })
    });
    document.body.removeChild(modal);
    openProduct(id);
  };
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

async function loadOrders() {
  const d = await fetchJSON(API + '/orders/history?sessionId=' + encodeURIComponent(sessionId));
  const el = document.getElementById('orders');
  if (el) el.innerHTML = (d.orders || []).map(o => `<div>#${o.orderId} — $${o.total}</div>`).join('');
}

function setup() {
  document.getElementById('refresh').addEventListener('click', () => {
    loadProducts();
  });
  document.getElementById('checkout').addEventListener('click', checkout);
  const ordersBtn = document.getElementById('ordersBtn');
  if (ordersBtn) ordersBtn.addEventListener('click', loadOrders);
}

(async function init() {
  setup();
  await loadCategories();
  await loadProducts();
  await loadCart();
  await loadWishlist();
})();
