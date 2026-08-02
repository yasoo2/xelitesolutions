/**
 * A shopping cart that actually is one.
 *
 * The store blueprint asks the model for "a working cart: clicking add updates
 * the badge and a slide-over panel with line items, quantity steppers and a
 * running total (localStorage, real JS — not a mockup)". A weak model writes a
 * badge that counts up and nothing else, and the behaviour audit — which only
 * asks whether a click changed anything — is satisfied by that.
 *
 * Multi-page sites made it worse rather than better: a cart held in a page
 * variable is emptied the moment the visitor clicks through to another page, so
 * a store that looked fine as one file is visibly broken as four.
 *
 * So the cart ships as runtime, the same way the UI kit ships as CSS. The model
 * only has to mark a product up; the behaviour is Joe's and is identical on
 * every page.
 *
 * What it will NOT do is pretend to take money. A "تم الطلب بنجاح" on a store
 * with no payment provider is exactly the kind of fiction this codebase has been
 * pulling out all week — checkout states plainly what it is.
 */

/** The markup contract, handed to the model alongside the blueprint. */
export function cartBrief(): string {
    return `CART — Joe ships the cart's JavaScript; you only write the markup.

- A product is any element with data-product, carrying:
    data-name="اسم المنتج" data-price="299" [data-currency="ر.س"] [data-image="…"]
  and an "add" control inside it with data-add. Example:
    <div class="card" data-product data-name="عود كمبودي" data-price="650" data-currency="ر.س">
      <img src="{{IMAGE:card|oud perfume bottle}}" alt="عود كمبودي">
      <h3>عود كمبودي</h3><strong>650 ر.س</strong>
      <button class="btn" data-add>أضف للسلة</button>
    </div>
- The header's cart button needs data-cart-open, and its badge data-cart-count:
    <button class="btn" data-cart-open aria-label="السلة">
      <svg width="20" height="20"><use href="#i-cart"/></svg> <span data-cart-count>0</span>
    </button>
- Do NOT write any cart JavaScript, any panel markup, or any localStorage code.
  It already exists, it persists across pages, and yours would fight with it.
- Do NOT write a fake checkout that claims an order was placed. The built-in
  checkout says truthfully that payment is not connected.`;
}

/**
 * The cart itself. Vanilla, no dependencies, no network, and it never throws
 * into the page — a store whose script dies takes its navigation with it.
 */
export function cartRuntime(isArabic: boolean): string {
    const t = isArabic
        ? {
            title: 'سلة التسوق', empty: 'سلتك فارغة.', total: 'الإجمالي', remove: 'إزالة',
            close: 'إغلاق', checkout: 'إتمام الشراء', qty: 'الكمية',
            notice: 'هذا المتجر لم يُوصَل بمزوّد دفع بعد، فلا يمكن إتمام عملية شراء حقيقية. محتويات سلتك محفوظة في هذا المتصفح.',
            added: 'أُضيف إلى السلة',
        }
        : {
            title: 'Your cart', empty: 'Your cart is empty.', total: 'Total', remove: 'Remove',
            close: 'Close', checkout: 'Checkout', qty: 'Quantity',
            notice: 'This store is not connected to a payment provider, so no real purchase can be completed. Your cart is saved in this browser.',
            added: 'Added to cart',
        };

    return `<script>
/* Joe cart — real storage, real totals, honest checkout. */
(function () {
  'use strict';
  var KEY = 'joe-cart:' + location.pathname.replace(/[^/]*$/, '');
  var T = ${JSON.stringify(t)};

  function read() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function write(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* private mode: cart is session-only */ }
    render();
  }
  function money(n, cur) {
    var v = Math.round(n * 100) / 100;
    return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)) + (cur ? ' ' + cur : '');
  }

  function ensurePanel() {
    var p = document.getElementById('joe-cart');
    if (p) return p;
    p = document.createElement('div');
    p.id = 'joe-cart';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-modal', 'true');
    p.setAttribute('aria-label', T.title);
    p.hidden = true;
    p.innerHTML =
      '<div data-cart-backdrop></div>' +
      '<aside>' +
        '<header><h2>' + T.title + '</h2>' +
          '<button type="button" data-cart-close aria-label="' + T.close + '">&times;</button></header>' +
        '<div data-cart-items></div>' +
        '<footer>' +
          '<div class="joe-cart-total"><span>' + T.total + '</span><strong data-cart-total>0</strong></div>' +
          '<button type="button" class="btn" data-cart-checkout>' + T.checkout + '</button>' +
          '<p data-cart-notice hidden>' + T.notice + '</p>' +
        '</footer>' +
      '</aside>';
    document.body.appendChild(p);
    p.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-cart-close],[data-cart-backdrop],[data-cart-checkout],[data-inc],[data-dec],[data-remove]') : null;
      if (!el) return;
      if (el.hasAttribute('data-cart-close') || el.hasAttribute('data-cart-backdrop')) return close();
      if (el.hasAttribute('data-cart-checkout')) {
        // Say what is true. A store with no payment provider cannot take an order.
        var n = p.querySelector('[data-cart-notice]');
        if (n) { n.hidden = false; n.focus && n.focus(); }
        return;
      }
      var id = el.getAttribute('data-inc') || el.getAttribute('data-dec') || el.getAttribute('data-remove');
      var items = read();
      var i = items.findIndex(function (x) { return x.id === id; });
      if (i < 0) return;
      if (el.hasAttribute('data-remove')) items.splice(i, 1);
      else if (el.hasAttribute('data-inc')) items[i].qty++;
      else if (--items[i].qty <= 0) items.splice(i, 1);
      write(items);
    });
    return p;
  }

  function open() {
    var p = ensurePanel();
    // Render AFTER the panel exists. The panel is created lazily on first open,
    // which is after the load-time render has already run — so without this the
    // badge was right and the panel opened empty.
    render();
    p.hidden = false;
    document.body.style.overflow = 'hidden';
    var c = p.querySelector('[data-cart-close]');
    if (c) c.focus();
  }
  function close() {
    var p = document.getElementById('joe-cart');
    if (p) p.hidden = true;
    document.body.style.overflow = '';
  }

  function render() {
    var items = read();
    var count = items.reduce(function (n, i) { return n + i.qty; }, 0);
    var total = items.reduce(function (n, i) { return n + i.qty * (Number(i.price) || 0); }, 0);
    var cur = (items[0] && items[0].currency) || '';

    Array.prototype.forEach.call(document.querySelectorAll('[data-cart-count]'), function (b) {
      b.textContent = String(count);
      b.setAttribute('data-count', String(count));
    });

    var p = document.getElementById('joe-cart');
    if (!p) return;
    var box = p.querySelector('[data-cart-items]');
    if (box) {
      box.innerHTML = items.length
        ? items.map(function (i) {
            return '<div class="joe-cart-line">' +
              (i.image ? '<img src="' + i.image + '" alt="">' : '') +
              '<div><strong>' + i.name + '</strong><span>' + money(i.price, i.currency) + '</span></div>' +
              '<div class="joe-cart-qty" role="group" aria-label="' + T.qty + '">' +
                '<button type="button" data-dec="' + i.id + '" aria-label="-">&minus;</button>' +
                '<span>' + i.qty + '</span>' +
                '<button type="button" data-inc="' + i.id + '" aria-label="+">+</button>' +
              '</div>' +
              '<button type="button" data-remove="' + i.id + '" aria-label="' + T.remove + '">&times;</button>' +
            '</div>';
          }).join('')
        : '<p class="joe-cart-empty">' + T.empty + '</p>';
    }
    var tot = p.querySelector('[data-cart-total]');
    if (tot) tot.textContent = money(total, cur);
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    if (t.closest('[data-cart-open]')) { e.preventDefault(); ensurePanel(); open(); return; }

    var add = t.closest('[data-add]');
    /* The model's own dialects. The brief says data-add inside data-product;
       a measured build wrote class="cart-btn" and id="add-to-cart" instead,
       and the behaviour audit pressed three "Add to Cart" buttons that logged
       to the console and did nothing else. The visitor does not care whose
       naming convention won — a button that says "add to cart" adds to the
       cart. The card is whatever container carries a heading and a price. */
    if (!add) {
      var legacy = t.closest('button, a');
      if (legacy && !legacy.closest('.joe-cart-panel') &&
          (/\bcart-btn\b/.test(legacy.className || '') ||
           /^add-to-cart/i.test(legacy.id || '') ||
           /add to cart|أضف (إلى |لل)?السلة|اضف (الى |لل)?السلة/i.test((legacy.textContent || '').trim()))) {
        add = legacy;
      }
      if (!add) return;
    }
    var card = add.closest('[data-product]');
    if (!card) {
      /* Nearest container that can NAME the product: a heading and, ideally,
         a price. Without one there is nothing honest to add. */
      var host = add.closest('.card, .product, article, li, [class*="item"]') || add.parentElement;
      if (host && host.querySelector && host.querySelector('h1,h2,h3,h4,.card-title')) card = host;
    }
    if (!card) return;
    e.preventDefault();

    var name = (card.getAttribute('data-name') || (card.querySelector('h1,h2,h3,h4') || {}).textContent || '').trim();
    var price = parseFloat(String(card.getAttribute('data-price') || '').replace(/[^0-9.]/g, '')) || 0;
    if (!price) {
      /* The visible price on the card — the discounted one when both appear. */
      var priceEl = card.querySelector('.new-price, [class*="price"] .new-price, .price, [class*="price"]');
      if (priceEl) price = parseFloat(String(priceEl.textContent || '').replace(/[^0-9.]/g, '')) || 0;
    }
    var img = card.getAttribute('data-image') || ((card.querySelector('img') || {}).getAttribute ? card.querySelector('img').getAttribute('src') : '');
    var id = card.getAttribute('data-id') || name;

    var items = read();
    var found = items.filter(function (x) { return x.id === id; })[0];
    if (found) found.qty++;
    else items.push({ id: id, name: name, price: price, currency: card.getAttribute('data-currency') || '', image: img, qty: 1 });
    write(items);

    // Visible confirmation on the control the visitor pressed.
    var was = add.textContent;
    add.textContent = T.added;
    add.setAttribute('data-added', '1');
    setTimeout(function () { add.textContent = was; add.removeAttribute('data-added'); }, 1400);
  });

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  // The badge has to be right the moment another page opens, not after a click.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
</script>`;
}

/** Styling for the cart panel, on the palette tokens like everything else. */
export function cartCss(): string {
    return `
/* Cart panel */
#joe-cart[hidden]{display:none}
#joe-cart{position:fixed;inset:0;z-index:9999}
#joe-cart [data-cart-backdrop]{position:absolute;inset:0;background:rgba(0,0,0,.45)}
#joe-cart aside{position:absolute;inset-block:0;inset-inline-end:0;width:min(420px,100%);background:var(--surface);
  color:var(--text);box-shadow:var(--shadow-lg);display:flex;flex-direction:column;animation:joe-cart-in .22s ease}
@keyframes joe-cart-in{from{transform:translateX(var(--joe-cart-from,100%));opacity:.6}to{transform:none;opacity:1}}
[dir="rtl"] #joe-cart aside{--joe-cart-from:-100%}
@media (prefers-reduced-motion:reduce){#joe-cart aside{animation:none}}
#joe-cart header{display:flex;align-items:center;justify-content:space-between;gap:var(--space-4);
  padding:var(--space-6);border-block-end:1px solid var(--border)}
#joe-cart header h2{margin:0;font-size:var(--step-2)}
#joe-cart [data-cart-close]{background:none;border:0;font-size:28px;line-height:1;cursor:pointer;color:var(--text-muted);padding:0 var(--space-2)}
#joe-cart [data-cart-close]:hover{color:var(--text)}
#joe-cart [data-cart-items]{flex:1;overflow:auto;padding:var(--space-4) var(--space-6)}
.joe-cart-line{display:grid;grid-template-columns:auto 1fr auto auto;gap:var(--space-4);align-items:center;
  padding:var(--space-4) 0;border-block-end:1px solid var(--border)}
.joe-cart-line img{width:56px;height:56px;object-fit:cover;border-radius:var(--radius)}
.joe-cart-line strong{display:block;font-size:var(--step-0)}
.joe-cart-line span{color:var(--text-muted);font-size:var(--step--1)}
.joe-cart-qty{display:flex;align-items:center;gap:var(--space-2)}
.joe-cart-qty button{width:32px;height:32px;border:1px solid var(--border);background:var(--bg);color:var(--text);
  border-radius:var(--radius);cursor:pointer;font-size:16px;line-height:1}
.joe-cart-qty button:hover{border-color:var(--brand);color:var(--brand)}
.joe-cart-line [data-remove]{background:none;border:0;color:var(--text-muted);font-size:22px;cursor:pointer;padding:0 var(--space-2)}
.joe-cart-line [data-remove]:hover{color:#dc2626}
.joe-cart-empty{color:var(--text-muted);text-align:center;padding:var(--space-16) 0}
#joe-cart footer{padding:var(--space-6);border-block-start:1px solid var(--border);display:grid;gap:var(--space-4)}
.joe-cart-total{display:flex;justify-content:space-between;align-items:baseline;font-size:var(--step-1)}
#joe-cart [data-cart-notice]{margin:0;font-size:var(--step--1);color:var(--text-muted);line-height:1.6}
[data-cart-count][data-count="0"]{opacity:.55}
[data-add][data-added]{background:var(--brand-dark)}`;
}

/** Is a cart worth shipping with this page? */
export function needsCart(kind: string): boolean {
    return kind === 'store';
}
