/* Bazaar frontend — talks to /api */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const tk = n => '৳' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = d => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const BG = { electronics: '#e3ecf7', fashion: '#f7e6ea', home: '#efe8dc', beauty: '#f6e7f3', books: '#e8eedf', grocery: '#fdf0d9' };

/* ---------- local storage (cart, wishlist, token) ---------- */
const ls = {
  get(k, d) { try { const v = localStorage.getItem('bz2_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('bz2_' + k, JSON.stringify(v)); } catch {} }
};
const state = { config: null, user: null, cart: ls.get('cart', []), wish: ls.get('wish', []), filters: { q: '', cats: [], max: 0, instock: false, sort: '' } };
const saveCart = () => { ls.set('cart', state.cart); renderNav(); };
const saveWish = () => { ls.set('wish', state.wish); renderNav(); };

/* ---------- API ---------- */
async function api(path, opts = {}) {
  const token = ls.get('token', null);
  const res = await fetch('/api/' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let data = {}; try { data = await res.json(); } catch {}
  if (res.status === 401 && token) { ls.set('token', null); state.user = null; renderNav(); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong (' + res.status + ')');
  return data;
}

/* ---------- UI helpers ---------- */
function toast(msg, type = '') { const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg; $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3000); }
function openModal(html, wide) { $('#modal').className = 'modal card' + (wide ? ' wide' : ''); $('#modal').innerHTML = html; $('#overlay').classList.add('show'); }
function closeModal() { $('#overlay').classList.remove('show'); }
$('#overlay').addEventListener('click', e => { if (e.target.id === 'overlay') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
function confirmBox(msg, onYes, yesLabel = 'Yes, continue') {
  openModal(`<h2>Are you sure?</h2><p class="muted" style="margin-bottom:20px">${esc(msg)}</p>
  <div class="actions"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="yesBtn">${yesLabel}</button></div>`);
  $('#yesBtn').onclick = () => { closeModal(); onYes(); };
}
const loading = () => { $('#app').innerHTML = '<div class="loader"><div class="spin"></div></div>'; };
const errorBox = (msg) => `<div class="card empty"><div class="big">⚠️</div><h3>Couldn't load this page</h3><p class="muted">${esc(msg)}</p><button class="btn btn-primary" style="margin-top:14px" onclick="route()">Try again</button></div>`;
function busy(btn, on, label) { if (!btn) return; if (on) { btn.dataset.l = btn.innerHTML; btn.disabled = true; btn.innerHTML = label || 'Please wait…'; } else { btn.disabled = false; btn.innerHTML = btn.dataset.l || btn.innerHTML; } }
const pimg = (p, size = '') => p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">` : `<span class="ic ${size}">${esc(p.icon || '📦')}</span>`;
const catName = id => state.config?.categories.find(c => c.id === id)?.name || id;
const starStr = a => '★★★★★'.slice(0, Math.round(a)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(a));
const statusPill = s => `<span class="pill ${{ Pending: 'warn', Cancelled: 'bad', Delivered: 'ok' }[s] || ''}">${esc(s)}</span>`;

/* ---------- cart actions ---------- */
function addToCart(p, qty = 1) {
  const line = state.cart.find(l => l.id === p.id);
  const have = line ? line.qty : 0;
  if (have + qty > p.stock) return toast(`Only ${p.stock} in stock`, 'bad');
  if (line) line.qty += qty; else state.cart.push({ id: p.id, qty });
  saveCart(); toast(`Added "${p.name}" to cart`, 'ok');
}
function toggleWish(id) {
  if (state.wish.includes(id)) { state.wish = state.wish.filter(x => x !== id); toast('Removed from wishlist'); }
  else { state.wish.push(id); toast('Saved to wishlist ♥', 'ok'); }
  saveWish(); $$(`[data-heart="${id}"]`).forEach(b => b.textContent = state.wish.includes(id) ? '❤️' : '🤍');
}
const productCache = {};
window.addCart = async (id, qty = 1) => { const p = productCache[id] || (await api('products/' + id)).product; addToCart(p, qty); };

/* ---------- nav ---------- */
function renderNav() {
  const cartN = state.cart.reduce((a, l) => a + l.qty, 0), u = state.user;
  const page = (location.hash.slice(1) || 'home').split('-')[0];
  const a = (h, label) => `<a href="#${h}" class="${page === h ? 'active' : ''}">${label}</a>`;
  $('#navlinks').innerHTML = a('home', 'Home') + a('shop', 'Shop') +
    a('wishlist', `♡ Wishlist${state.wish.length ? ` <span class="badge">${state.wish.length}</span>` : ''}`) +
    a('cart', `🛒 Cart${cartN ? ` <span class="badge">${cartN}</span>` : ''}`) +
    (u ? a('account', '👤 ' + esc(u.name.split(' ')[0])) : a('login', 'Login / Sign up')) +
    (u?.role === 'admin' ? a('admin', '⚙️ Admin') : '');
}
$('#menuBtn').onclick = () => $('#navlinks').classList.toggle('open');
let searchT;
$('#searchInput').addEventListener('input', e => {
  state.filters.q = e.target.value; clearTimeout(searchT);
  searchT = setTimeout(() => { if (!location.hash.startsWith('#shop')) location.hash = 'shop'; else renderShop(); }, 300);
});

/* ---------- product card ---------- */
function productCard(p) {
  productCache[p.id] = p;
  const off = p.old_price > p.price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
  return `<div class="card pcard">
    <div class="pimg" style="background:${BG[p.category] || '#eee'}" onclick="location.hash='product-${p.id}'">
      ${off ? `<span class="tag">-${off}%</span>` : ''}
      <button class="heart" data-heart="${p.id}" onclick="event.stopPropagation();toggleWish(${p.id})" aria-label="Wishlist">${state.wish.includes(p.id) ? '❤️' : '🤍'}</button>
      ${pimg(p)}
    </div>
    <div class="pbody">
      <a class="name" href="#product-${p.id}">${esc(p.name)}</a>
      <div class="meta"><span>${esc(catName(p.category))}</span><span class="stars">${p.reviews ? starStr(p.rating) + ' (' + p.reviews + ')' : ''}</span></div>
      <div><span class="price">${tk(p.price)}</span>${off ? `<span class="old">${tk(p.old_price)}</span>` : ''}</div>
      ${p.stock > 0 ? `<button class="btn btn-primary btn-sm" onclick="addCart(${p.id})">Add to cart</button>` : `<button class="btn btn-ghost btn-sm" disabled>Out of stock</button>`}
    </div></div>`;
}

/* ================= PAGES ================= */
async function renderHome() {
  loading();
  try {
    const [f, d] = await Promise.all([api('products?featured=1&limit=8'), api('products?deals=1&sort=deals&limit=4')]);
    $('#app').innerHTML = `
    <section class="hero">
      <div>
        <span class="pill hero-pill">🎉 Winter Sale — up to 30% off</span>
        <h1>Everything you need, delivered to your door.</h1>
        <p>Shop electronics, fashion, home essentials and fresh groceries. Free delivery on orders over ${tk(state.config.freeShipMin)}. Use code <b>SAVE10</b> for an extra 10% off.</p>
        <div class="row-btns"><a href="#shop" class="btn btn-accent">Start shopping →</a>${state.user ? '' : '<a href="#login" class="btn btn-ghost">Create account</a>'}</div>
      </div>
      <div class="emoji-stack">🎧👟<br>🪴🥭</div>
    </section>
    <div class="perks">
      <div class="card perk"><span class="ic">🚚</span><div><b>Fast delivery</b><span class="muted">Same-day express in Dhaka</span></div></div>
      <div class="card perk"><span class="ic">💵</span><div><b>Cash on delivery</b><span class="muted">Pay when it arrives</span></div></div>
      <div class="card perk"><span class="ic">↩️</span><div><b>7-day returns</b><span class="muted">Hassle-free</span></div></div>
      <div class="card perk"><span class="ic">📱</span><div><b>bKash payment</b><span class="muted">Secure & instant</span></div></div>
    </div>
    <div class="section-title"><h2>Shop by category</h2></div>
    <div class="cats">${state.config.categories.map(c => `<a class="card cat" href="#shop" onclick="state.filters.cats=['${c.id}']"><div class="ic">${c.icon}</div><div>${c.name}</div></a>`).join('')}</div>
    <div class="section-title"><h2>Featured products</h2><a href="#shop" class="muted">View all →</a></div>
    <div class="grid">${f.products.map(productCard).join('')}</div>
    ${d.products.length ? `<div class="section-title"><h2>Today's best deals</h2></div><div class="grid">${d.products.map(productCard).join('')}</div>` : ''}`;
  } catch (e) { $('#app').innerHTML = errorBox(e.message); }
}

async function renderShop() {
  const F = state.filters;
  if (!$('#shopGrid')) {
    $('#app').innerHTML = `
    <div class="mobile-search field"><input id="mSearch" placeholder="Search products…"></div>
    <div class="shop">
      <aside class="card filters">
        <h3>Category</h3>
        ${state.config.categories.map(c => `<label><input type="checkbox" value="${c.id}" class="catcb"> ${c.icon} ${c.name}</label>`).join('')}
        <h3>Max price</h3>
        <select id="maxP">${[0, 500, 1000, 2000, 3000, 5000].map(v => `<option value="${v}">${v ? 'Under ' + tk(v) : 'Any price'}</option>`).join('')}</select>
        <h3>Availability</h3>
        <label><input type="checkbox" id="inStock"> In stock only</label>
        <button class="btn btn-ghost btn-sm" style="margin-top:16px;width:100%" id="clearF">Clear filters</button>
      </aside>
      <section>
        <div class="toolbar"><div id="count" class="muted"></div>
          <select id="sortSel">${[['', 'Featured'], ['low', 'Price: low to high'], ['high', 'Price: high to low'], ['rating', 'Top rated'], ['new', 'Newest'], ['name', 'Name A–Z']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        </div>
        <div id="shopGrid"></div>
      </section>
    </div>`;
    $$('.catcb').forEach(cb => cb.onchange = () => { F.cats = $$('.catcb:checked').map(x => x.value); renderShop(); });
    $('#maxP').onchange = e => { F.max = +e.target.value; renderShop(); };
    $('#inStock').onchange = e => { F.instock = e.target.checked; renderShop(); };
    $('#sortSel').onchange = e => { F.sort = e.target.value; renderShop(); };
    $('#clearF').onclick = () => { Object.assign(F, { q: '', cats: [], max: 0, instock: false, sort: '' }); $('#searchInput').value = ''; $('#mSearch').value = ''; renderShop(); };
    $('#mSearch').oninput = e => { F.q = e.target.value; $('#searchInput').value = F.q; clearTimeout(searchT); searchT = setTimeout(renderShop, 300); };
  }
  $$('.catcb').forEach(cb => cb.checked = F.cats.includes(cb.value));
  $('#maxP').value = F.max; $('#inStock').checked = F.instock; $('#sortSel').value = F.sort;
  if (document.activeElement !== $('#mSearch')) $('#mSearch').value = F.q;
  $('#shopGrid').innerHTML = '<div class="loader"><div class="spin"></div></div>';
  const qs = new URLSearchParams({ ...(F.q && { q: F.q }), ...(F.cats.length && { category: F.cats.join(',') }), ...(F.max && { max: F.max }), ...(F.instock && { instock: 1 }), ...(F.sort && { sort: F.sort }) });
  try {
    const { products } = await api('products?' + qs);
    $('#count').innerHTML = `<b style="color:var(--ink)">${products.length}</b> product${products.length !== 1 ? 's' : ''}${F.q ? ` for “${esc(F.q)}”` : ''}`;
    $('#shopGrid').innerHTML = products.length ? `<div class="grid">${products.map(productCard).join('')}</div>`
      : `<div class="card empty"><div class="big">🔍</div><h3>No products found</h3><p class="muted">Try a different search or clear filters.</p></div>`;
  } catch (e) { $('#shopGrid').innerHTML = errorBox(e.message); }
}

async function renderProduct(id) {
  loading();
  let data; try { data = await api('products/' + id); } catch (e) {
    $('#app').innerHTML = `<div class="card empty"><div class="big">🤷</div><h3>${esc(e.message)}</h3><a href="#shop" class="btn btn-primary" style="margin-top:14px">Back to shop</a></div>`; return;
  }
  const p = data.product; productCache[p.id] = p;
  const related = (await api(`products?category=${p.category}&limit=5`).catch(() => ({ products: [] }))).products.filter(x => x.id !== p.id).slice(0, 4);
  const off = p.old_price > p.price;
  $('#app').innerHTML = `
  <p class="crumbs"><a href="#home">Home</a> / <a href="#shop">Shop</a> / ${esc(p.name)}</p>
  <div class="detail">
    <div class="pimg big" style="background:${BG[p.category]}">${pimg(p, 'xl')}</div>
    <div>
      <span class="pill">${esc(catName(p.category))}</span>
      <h1>${esc(p.name)}</h1>
      <div class="stars" style="margin-bottom:12px">${p.reviews ? `${starStr(p.rating)} <span class="muted">${p.rating} · ${p.reviews} review${p.reviews > 1 ? 's' : ''}</span>` : '<span class="muted">No reviews yet</span>'}</div>
      <div style="font-size:28px;margin-bottom:14px"><span class="price">${tk(p.price)}</span>${off ? `<span class="old">${tk(p.old_price)}</span>` : ''}</div>
      <p style="margin-bottom:18px;white-space:pre-line">${esc(p.description)}</p>
      <p style="margin-bottom:18px">${p.stock > 0 ? (p.stock <= 5 ? `<span class="pill warn">Only ${p.stock} left!</span>` : `<span class="pill">In stock</span>`) : '<span class="pill bad">Out of stock</span>'}</p>
      <div class="row-btns">
        <div class="qty"><button id="qm">−</button><input id="qv" value="1" inputmode="numeric"><button id="qp">+</button></div>
        <button class="btn btn-primary" id="addBtn" ${p.stock ? '' : 'disabled'}>Add to cart</button>
        <button class="btn btn-accent" id="buyBtn" ${p.stock ? '' : 'disabled'}>Buy now</button>
        <button class="btn btn-ghost" data-heart="${p.id}" onclick="toggleWish(${p.id})">${state.wish.includes(p.id) ? '❤️' : '🤍'}</button>
      </div>
      <div class="card info-box">${Object.values(state.config.delivery).map(d => `🚚 ${esc(d.label)}: <b>${d.fee ? tk(d.fee) : 'Free'}</b>`).join('<br>')}<br>🎁 Free standard delivery over ${tk(state.config.freeShipMin)} · 💵 Cash on delivery · ↩️ 7-day return</div>
    </div>
  </div>
  <div class="section-title"><h2>Customer reviews</h2></div>
  <div class="card" style="padding:20px">
    ${state.user ? `<form id="revForm" style="margin-bottom:10px">
      <div class="row"><div class="field" style="max-width:160px"><label>Rating</label><select id="rvStars">${[5, 4, 3, 2, 1].map(s => `<option value="${s}">${'★'.repeat(s)}</option>`).join('')}</select></div>
      <div class="field"><label>Your review</label><input id="rvText" placeholder="What did you think?" maxlength="600" required></div></div>
      <button class="btn btn-primary btn-sm">Post review</button></form>`
      : `<p class="muted"><a href="#login" class="link">Log in</a> to write a review.</p>`}
    ${data.reviews.length ? data.reviews.map(v => `<div class="review"><div class="stars">${starStr(v.stars)}</div><b>${esc(v.user_name)}</b> <span class="muted small">· ${new Date(v.created_at).toLocaleDateString()}</span><p>${esc(v.body)}</p></div>`).join('') : '<p class="muted" style="padding-top:10px">Be the first to review this product.</p>'}
  </div>
  ${related.length ? `<div class="section-title"><h2>You may also like</h2></div><div class="grid">${related.map(productCard).join('')}</div>` : ''}`;
  const qv = $('#qv'), clamp = v => Math.max(1, Math.min(p.stock || 1, parseInt(v) || 1));
  $('#qm').onclick = () => qv.value = clamp(+qv.value - 1);
  $('#qp').onclick = () => qv.value = clamp(+qv.value + 1);
  qv.onchange = () => qv.value = clamp(qv.value);
  $('#addBtn').onclick = () => addToCart(p, clamp(qv.value));
  $('#buyBtn').onclick = () => { const l = state.cart.find(x => x.id === p.id); if (!l) addToCart(p, clamp(qv.value)); location.hash = 'cart'; };
  const f = $('#revForm'); if (f) f.onsubmit = async e => {
    e.preventDefault(); const b = f.querySelector('button'); busy(b, true);
    try { await api(`products/${p.id}/reviews`, { method: 'POST', body: { stars: +$('#rvStars').value, body: $('#rvText').value } }); toast('Review posted, thank you!', 'ok'); renderProduct(p.id); }
    catch (err) { toast(err.message, 'bad'); busy(b, false); }
  };
}

/* ---- cart & checkout share a server quote ---- */
const checkout = { delivery: ls.get('delivery', 'inside_dhaka'), coupon: ls.get('coupon', null), payment: 'cod' };
async function getQuote() {
  const qd = await api('cart/quote', { method: 'POST', body: { items: state.cart, delivery: checkout.delivery, coupon: checkout.coupon } });
  // sync cart with server truth (removed / clamped items)
  const fixed = qd.items.map(i => ({ id: i.id, qty: i.qty }));
  if (JSON.stringify(fixed) !== JSON.stringify(state.cart)) { state.cart = fixed; saveCart(); }
  qd.issues.forEach(i => toast(i.msg, 'bad'));
  if (qd.couponError) { toast(qd.couponError, 'bad'); checkout.coupon = null; ls.set('coupon', null); }
  qd.items.forEach(i => productCache[i.id] = i);
  return qd;
}
function summaryHTML(qd, withBtn) {
  return `<aside class="card summary">
    <h3>Order summary</h3>
    <div class="field"><label>Coupon code</label>
      ${checkout.coupon ? `<div class="pill coupon"><span>✓ ${esc(checkout.coupon)}</span><button onclick="setCoupon(null)" aria-label="Remove coupon">✕</button></div>`
      : `<div style="display:flex;gap:8px"><input id="cpn" placeholder="e.g. SAVE10"><button class="btn btn-ghost btn-sm" onclick="setCoupon($('#cpn').value)">Apply</button></div>
         <span class="muted small">Try ${state.config.coupons.map(c => c.code).join(', ')}</span>`}
    </div>
    <div class="line"><span>Subtotal (${qd.items.reduce((a, i) => a + i.qty, 0)} items)</span><span>${tk(qd.subtotal)}</span></div>
    ${qd.discount ? `<div class="line" style="color:var(--ok)"><span>Discount</span><span>−${tk(qd.discount)}</span></div>` : ''}
    <div class="line"><span>Delivery</span><span>${qd.delivery_fee ? tk(qd.delivery_fee) : 'FREE'}</span></div>
    ${qd.subtotal < state.config.freeShipMin && qd.delivery_fee && checkout.delivery !== 'express' ? `<div class="muted small">Add ${tk(state.config.freeShipMin - qd.subtotal)} more for free delivery</div>` : ''}
    <div class="line total"><span>Total</span><span>${tk(qd.total)}</span></div>
    ${withBtn ? `<a href="#checkout" class="btn btn-primary" style="width:100%;margin-top:14px">Proceed to checkout →</a>` : ''}
  </aside>`;
}
window.setCoupon = async code => {
  code = code ? String(code).trim().toUpperCase() : null;
  if (code) {
    try { const qd = await api('cart/quote', { method: 'POST', body: { items: state.cart, delivery: checkout.delivery, coupon: code } }); if (qd.couponError) return toast(qd.couponError, 'bad'); }
    catch (e) { return toast(e.message, 'bad'); }
    toast('Coupon applied!', 'ok');
  }
  checkout.coupon = code; ls.set('coupon', code); route();
};
window.setQty = (id, qty) => { const l = state.cart.find(x => x.id === id); if (!l) return; l.qty = Math.max(1, qty); saveCart(); renderCart(); };
window.removeLine = id => { state.cart = state.cart.filter(l => l.id !== id); saveCart(); renderCart(); };

async function renderCart() {
  if (!state.cart.length) { $('#app').innerHTML = `<div class="card empty"><div class="big">🛒</div><h2>Your cart is empty</h2><p class="muted" style="margin:6px 0 18px">Looks like you haven't added anything yet.</p><a href="#shop" class="btn btn-primary">Browse products</a></div>`; return; }
  if (!$('#cartWrap')) loading();
  let qd; try { qd = await getQuote(); } catch (e) { $('#app').innerHTML = errorBox(e.message); return; }
  if (!qd.items.length) return renderCart();
  $('#app').innerHTML = `<h1 class="page-h">Shopping cart</h1>
  <div class="cart-layout" id="cartWrap">
    <div class="card">${qd.items.map(i => `
      <div class="citem">
        <a class="thumb" href="#product-${i.id}" style="background:${BG[i.category]}">${pimg(i)}</a>
        <div style="flex:1;min-width:0"><a href="#product-${i.id}"><b>${esc(i.name)}</b></a><div class="muted small">${tk(i.price)} each · ${i.stock} in stock</div>
          <button class="link-btn" onclick="removeLine(${i.id})">Remove</button></div>
        <div class="qty"><button onclick="setQty(${i.id},${i.qty - 1})">−</button><input value="${i.qty}" onchange="setQty(${i.id},parseInt(this.value)||1)"><button onclick="setQty(${i.id},${i.qty + 1})" ${i.qty >= i.stock ? 'disabled' : ''}>+</button></div>
        <div class="price line-total">${tk(i.price * i.qty)}</div>
      </div>`).join('')}
    </div>
    ${summaryHTML(qd, true)}
  </div>`;
}

async function renderCheckout() {
  if (!state.cart.length) { location.hash = 'cart'; return; }
  if (!state.user) { ls.set('after', 'checkout'); toast('Please log in or create an account to place your order'); location.hash = 'login'; return; }
  loading();
  let qd; try { qd = await getQuote(); } catch (e) { $('#app').innerHTML = errorBox(e.message); return; }
  if (!qd.items.length) { location.hash = 'cart'; return; }
  const u = state.user, D = state.config.delivery, draft = ls.get('draft', {});
  const v = k => esc(draft[k] ?? u[k] ?? '');
  $('#app').innerHTML = `<h1 class="page-h">Checkout</h1>
  <div class="cart-layout">
    <form class="card" style="padding:24px" id="coForm" novalidate>
      <h3 class="step"><span>1</span> Delivery address</h3>
      <div class="row"><div class="field"><label>Receiver name *</label><input name="name" value="${v('name')}" autocomplete="name"></div>
      <div class="field"><label>Phone *</label><input name="phone" placeholder="01XXXXXXXXX" value="${v('phone')}" autocomplete="tel"></div></div>
      <div class="field"><label>Full address *</label><textarea name="address" rows="2" placeholder="House, road, area" autocomplete="street-address">${v('address')}</textarea></div>
      <div class="row"><div class="field"><label>City / District *</label><input name="city" value="${v('city')}" placeholder="e.g. Dhaka"></div>
      <div class="field"><label>Note for rider</label><input name="note" value="${esc(draft.note || '')}" placeholder="Optional"></div></div>
      <label class="check"><input type="checkbox" name="saveAddress" checked> Save this address to my account</label>

      <h3 class="step"><span>2</span> Delivery method</h3>
      ${Object.entries(D).map(([k, d]) => `<label class="pay-opt ${checkout.delivery === k ? 'on' : ''}"><input type="radio" name="delivery" value="${k}" ${checkout.delivery === k ? 'checked' : ''}>
        <div style="flex:1"><b>${esc(d.label)}</b></div><b>${d.fee ? tk(d.fee) : 'Free'}</b></label>`).join('')}

      <h3 class="step"><span>3</span> Payment</h3>
      <label class="pay-opt ${checkout.payment === 'cod' ? 'on' : ''}"><input type="radio" name="payment" value="cod" ${checkout.payment === 'cod' ? 'checked' : ''}> 💵 <div><b>Cash on Delivery</b><div class="muted small">Pay the rider when you receive</div></div></label>
      <label class="pay-opt ${checkout.payment === 'bkash' ? 'on' : ''}"><input type="radio" name="payment" value="bkash" ${checkout.payment === 'bkash' ? 'checked' : ''}> 📱 <div><b>bKash</b><div class="muted small">Send Money ${tk(qd.total)} to <b>01700-000000</b>, then enter the TrxID</div></div></label>
      ${checkout.payment === 'bkash' ? `<div class="field" style="margin-top:8px"><label>bKash Transaction ID *</label><input name="paymentRef" placeholder="e.g. 9A7B6C5D4E" value="${esc(draft.paymentRef || '')}"></div>` : ''}
      <p class="err" id="coErr"></p>
      <button class="btn btn-primary btn-lg" id="placeBtn">Place order · ${tk(qd.total)}</button>
    </form>
    <div>
      <div class="card mini-items">${qd.items.map(i => `<div class="mini"><span>${esc(i.icon)} ${esc(i.name)} × ${i.qty}</span><span>${tk(i.price * i.qty)}</span></div>`).join('')}</div>
      ${summaryHTML(qd, false)}
    </div>
  </div>`;
  const f = $('#coForm');
  const saveDraft = () => ls.set('draft', Object.fromEntries(new FormData(f)));
  f.addEventListener('input', saveDraft);
  $$('input[name=delivery]').forEach(r => r.onchange = e => { saveDraft(); checkout.delivery = e.target.value; ls.set('delivery', checkout.delivery); renderCheckout(); });
  $$('input[name=payment]').forEach(r => r.onchange = e => { saveDraft(); checkout.payment = e.target.value; renderCheckout(); });
  f.onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(f)); const btn = $('#placeBtn'); $('#coErr').textContent = '';
    busy(btn, true, 'Placing order…');
    try {
      const { order } = await api('orders', { method: 'POST', body: {
        items: state.cart, delivery: checkout.delivery, coupon: checkout.coupon, payment: checkout.payment, paymentRef: d.paymentRef,
        saveAddress: !!d.saveAddress, customer: { name: d.name, phone: d.phone, address: d.address, city: d.city, note: d.note } } });
      state.cart = []; saveCart(); checkout.coupon = null; ls.set('coupon', null); ls.set('draft', {});
      if (d.saveAddress) Object.assign(state.user, { phone: d.phone, address: d.address, city: d.city });
      ls.set('lastOrder', order); location.hash = 'success';
    } catch (err) { $('#coErr').textContent = err.message; toast(err.message, 'bad'); busy(btn, false); }
  };
}

function renderSuccess() {
  const o = ls.get('lastOrder', null); if (!o) { location.hash = 'home'; return; }
  $('#app').innerHTML = `<div class="card empty narrow">
    <div class="big">✅</div><h1>Order placed!</h1>
    <p class="muted" style="margin:8px 0 18px">Thank you, ${esc(o.customer_name)}. We'll call ${esc(o.phone)} to confirm your order.</p>
    <div class="card kv">
      <div><span class="muted">Order ID</span><b>${esc(o.code)}</b></div>
      <div><span class="muted">Delivery</span><b>${esc(o.delivery_label)}</b></div>
      <div><span class="muted">Payment</span><b>${o.payment_method === 'cod' ? 'Cash on Delivery' : 'bKash'}</b></div>
      <div><span class="muted">Total</span><b>${tk(o.total)}</b></div>
    </div>
    <div class="row-btns center"><a href="#orders" class="btn btn-ghost">View my orders</a><a href="#shop" class="btn btn-primary">Continue shopping</a></div>
  </div>`;
}

function orderCard(o) {
  const steps = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered'], idx = steps.indexOf(o.status);
  return `<div class="card order">
    <div class="order-head"><div><b>#${esc(o.code)}</b> <span class="muted small">· ${fmtDate(o.created_at)}</span></div>${statusPill(o.status)}</div>
    ${o.status !== 'Cancelled' ? `<div class="progress">${steps.map((s, i) => `<div class="${i <= idx ? 'done' : ''}"><span></span>${s}</div>`).join('')}</div>` : ''}
    ${o.items.map(i => `<div class="mini"><span>${esc(i.icon)} ${esc(i.name)} × ${i.qty}</span><span>${tk(i.price * i.qty)}</span></div>`).join('')}
    <div class="order-foot">
      <span class="muted small">${esc(o.delivery_label)} · ${o.payment_method === 'cod' ? 'Cash on Delivery' : 'bKash'} · ${esc(o.city)}</span>
      <div class="row-btns">${['Pending', 'Confirmed'].includes(o.status) ? `<button class="btn btn-danger btn-sm" onclick="cancelOrder(${o.id})">Cancel order</button>` : ''}<b>${tk(o.total)}</b></div>
    </div></div>`;
}
window.cancelOrder = id => confirmBox('Cancel this order?', async () => {
  try { await api(`orders/${id}/cancel`, { method: 'POST' }); toast('Order cancelled'); renderOrders(); } catch (e) { toast(e.message, 'bad'); }
}, 'Yes, cancel it');

async function renderOrders() {
  if (!state.user) { ls.set('after', 'orders'); location.hash = 'login'; return; }
  loading();
  try {
    const { orders } = await api('orders/mine');
    $('#app').innerHTML = `<h1 class="page-h">My orders</h1>` + (orders.length ? orders.map(orderCard).join('') :
      `<div class="card empty"><div class="big">📦</div><h3>No orders yet</h3><a href="#shop" class="btn btn-primary" style="margin-top:14px">Start shopping</a></div>`);
  } catch (e) { $('#app').innerHTML = errorBox(e.message); }
}

function renderTrack() {
  $('#app').innerHTML = `<div class="card auth"><h1>Track your order</h1><p class="muted" style="margin-bottom:18px">Enter your order ID and the phone number used at checkout.</p>
  <form id="trk"><div class="field"><label>Order ID</label><input id="tid" placeholder="BZ…"></div>
  <div class="field"><label>Phone</label><input id="tph" placeholder="01XXXXXXXXX"></div><button class="btn btn-primary" style="width:100%">Track</button></form><div id="trkRes" style="margin-top:18px"></div></div>`;
  $('#trk').onsubmit = async e => {
    e.preventDefault();
    try {
      const { order: o } = await api(`orders/track?code=${encodeURIComponent($('#tid').value)}&phone=${encodeURIComponent($('#tph').value)}`);
      $('#trkRes').innerHTML = `<p><b>#${esc(o.code)}</b> ${statusPill(o.status)}</p><p class="muted small">${esc(o.delivery_label)} · ${tk(o.total)}</p>
        <div class="timeline">${o.events.map(ev => `<div><b>${esc(ev.status)}</b> <span class="muted small">${fmtDate(ev.created_at)}</span>${ev.note ? `<div class="small">${esc(ev.note)}</div>` : ''}</div>`).join('')}</div>`;
    } catch (err) { $('#trkRes').innerHTML = `<p class="err">${esc(err.message)}</p>`; }
  };
}

async function renderWishlist() {
  if (!state.wish.length) { $('#app').innerHTML = `<h1 class="page-h">My wishlist</h1><div class="card empty"><div class="big">🤍</div><h3>Your wishlist is empty</h3><p class="muted">Tap the heart on any product to save it.</p><a href="#shop" class="btn btn-primary" style="margin-top:14px">Browse products</a></div>`; return; }
  loading();
  const { products } = await api('products');
  const list = products.filter(p => state.wish.includes(p.id));
  $('#app').innerHTML = `<h1 class="page-h">My wishlist</h1><div class="grid">${list.map(productCard).join('')}</div>`;
}

function renderLogin(mode) {
  if (state.user) { location.hash = 'account'; return; }
  mode = mode || 'login';
  $('#app').innerHTML = `<div class="card auth">
    <h1>${mode === 'login' ? 'Welcome back' : 'Create account'}</h1>
    <p class="muted" style="margin-bottom:18px">${mode === 'login' ? 'Log in to place orders and track deliveries.' : 'Join Bazaar in seconds.'}</p>
    ${state.config.needsOwner ? '<p class="pill warn" style="margin-bottom:14px;display:block">New store: the first account you create becomes the admin.</p>' : ''}
    <div class="tabs"><button class="${mode === 'login' ? 'on' : ''}" onclick="renderLogin('login')">Log in</button><button class="${mode === 'signup' ? 'on' : ''}" onclick="renderLogin('signup')">Sign up</button></div>
    <form id="authForm" novalidate>
      ${mode === 'signup' ? `<div class="field"><label>Full name</label><input name="name" autocomplete="name"></div><div class="field"><label>Phone (optional)</label><input name="phone" placeholder="01XXXXXXXXX" autocomplete="tel"></div>` : ''}
      <div class="field"><label>Email</label><input name="email" type="email" autocomplete="email"></div>
      <div class="field"><label>Password</label><input name="password" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" placeholder="${mode === 'signup' ? 'At least 6 characters' : ''}"></div>
      <p class="err" id="authErr"></p>
      <button class="btn btn-primary" style="width:100%">${mode === 'login' ? 'Log in' : 'Create account'}</button>
    </form></div>`;
  $('#authForm').onsubmit = async e => {
    e.preventDefault(); const b = e.target.querySelector('button'); busy(b, true);
    try {
      const r = await api(mode === 'login' ? 'auth/login' : 'auth/register', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      ls.set('token', r.token); state.user = r.user;
      toast(mode === 'login' ? `Welcome back, ${r.user.name.split(' ')[0]}!` : r.user.role === 'admin' ? 'Store owner account created — you are the admin 👑' : 'Account created! Welcome 🎉', 'ok');
      state.config.needsOwner = false;
      const after = ls.get('after', null); ls.set('after', null);
      location.hash = after || (r.user.role === 'admin' ? 'admin' : 'home');
    } catch (err) { $('#authErr').textContent = err.message; busy(b, false); }
  };
}

async function renderAccount() {
  const u = state.user; if (!u) { location.hash = 'login'; return; }
  $('#app').innerHTML = `<h1 class="page-h">My account</h1>
  <div class="cart-layout">
    <div>
      <form class="card pad" id="profForm"><h3>Profile & default address</h3>
        <div class="row"><div class="field"><label>Name</label><input name="name" value="${esc(u.name)}"></div><div class="field"><label>Email</label><input value="${esc(u.email)}" disabled></div></div>
        <div class="row"><div class="field"><label>Phone</label><input name="phone" value="${esc(u.phone || '')}" placeholder="01XXXXXXXXX"></div><div class="field"><label>City</label><input name="city" value="${esc(u.city || '')}"></div></div>
        <div class="field"><label>Address</label><textarea name="address" rows="2">${esc(u.address || '')}</textarea></div>
        <button class="btn btn-primary">Save profile</button></form>
      <form class="card pad" id="pwForm" style="margin-top:18px"><h3>Change password</h3>
        <div class="row"><div class="field"><label>Current password</label><input type="password" name="currentPassword"></div><div class="field"><label>New password</label><input type="password" name="newPassword"></div></div>
        <button class="btn btn-ghost">Update password</button></form>
    </div>
    <aside class="card summary">
      <div style="font-size:44px">👤</div><h3>${esc(u.name)}</h3><p class="muted small" style="margin-bottom:14px">${esc(u.email)}${u.role === 'admin' ? ' · <b>Admin</b>' : ''}</p>
      ${u.role === 'admin' ? '<a href="#admin" class="btn btn-accent full">Open admin panel</a>' : ''}
      <a href="#orders" class="btn btn-ghost full">📦 My orders</a>
      <a href="#wishlist" class="btn btn-ghost full">♡ Wishlist</a>
      <a href="#track" class="btn btn-ghost full">🔎 Track an order</a>
      <button class="btn btn-danger full" onclick="logout()">Log out</button>
    </aside>
  </div>`;
  const save = async (e, body, msg) => {
    e.preventDefault(); const b = e.target.querySelector('button'); busy(b, true);
    try { const r = await api('auth/me', { method: 'PUT', body }); state.user = r.user; toast(msg, 'ok'); renderNav(); if (body.newPassword) e.target.reset(); }
    catch (err) { toast(err.message, 'bad'); } busy(b, false);
  };
  $('#profForm').onsubmit = e => save(e, Object.fromEntries(new FormData(e.target)), 'Profile saved');
  $('#pwForm').onsubmit = e => save(e, { ...u, ...Object.fromEntries(new FormData(e.target)) }, 'Password updated');
}
window.logout = () => { ls.set('token', null); state.user = null; toast('Logged out'); location.hash = 'home'; renderNav(); };

/* ================= ADMIN ================= */
const admin = { tab: 'dashboard', orderStatus: '', orderQ: '', userQ: '', productQ: '' };
async function renderAdmin(tab) {
  if (!state.user) { ls.set('after', 'admin'); location.hash = 'login'; return; }
  if (state.user.role !== 'admin') { $('#app').innerHTML = `<div class="card empty"><div class="big">🔒</div><h2>Admin access only</h2><p class="muted">Your account doesn't have admin rights.</p></div>`; return; }
  admin.tab = tab || admin.tab;
  const T = (k, l) => `<button class="${admin.tab === k ? 'on' : ''}" onclick="renderAdmin('${k}')">${l}</button>`;
  $('#app').innerHTML = `<div class="admin-head"><h1>Admin panel</h1><button class="btn btn-ghost btn-sm" onclick="logout()">Log out</button></div>
    <div class="tabs admin-tabs">${T('dashboard', '📊 Dashboard')}${T('orders', '📦 Orders')}${T('products', '🏷️ Products')}${T('customers', '👥 Customers')}</div>
    <div id="adminBody"><div class="loader"><div class="spin"></div></div></div>`;
  try { await ({ dashboard: adminDashboard, orders: adminOrders, products: adminProducts, customers: adminCustomers }[admin.tab])(); }
  catch (e) { $('#adminBody').innerHTML = errorBox(e.message); }
}
async function adminDashboard() {
  const s = await api('admin/stats');
  $('#adminBody').innerHTML = `<div class="stats">
    <div class="card stat"><div class="v">${tk(s.revenue)}</div><div class="k">Total revenue</div></div>
    <div class="card stat"><div class="v">${tk(s.today)}</div><div class="k">Last 24 hours</div></div>
    <div class="card stat clickable" onclick="admin.orderStatus='Pending';renderAdmin('orders')"><div class="v">${s.orders}</div><div class="k">Orders · <b style="color:#a85a14">${s.pending} pending</b></div></div>
    <div class="card stat clickable" onclick="renderAdmin('customers')"><div class="v">${s.customers}</div><div class="k">Customers</div></div>
    <div class="card stat clickable" onclick="renderAdmin('products')"><div class="v">${s.products}</div><div class="k">Products · ${s.low_stock} low stock</div></div>
  </div>
  <div class="card pad"><h3>Top selling products</h3>${s.top.length ? s.top.map(t => `<div class="mini"><span>${esc(t.name)}</span><b>${t.sold} sold</b></div>`).join('') : '<p class="muted">No sales yet.</p>'}</div>`;
}
async function adminOrders() {
  const qs = new URLSearchParams({ ...(admin.orderStatus && { status: admin.orderStatus }), ...(admin.orderQ && { q: admin.orderQ }) });
  const { orders } = await api('admin/orders?' + qs);
  $('#adminBody').innerHTML = `<div class="toolbar">
      <input class="inp" id="oq" placeholder="Search order ID, name, phone…" value="${esc(admin.orderQ)}">
      <select id="os"><option value="">All statuses</option>${state.config.statuses.map(s => `<option ${s === admin.orderStatus ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    <div class="card table-scroll">${orders.length ? `<table><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Delivery / Payment</th><th>Status</th><th></th></tr>
    ${orders.map(o => { window['_o' + o.id] = o; return `<tr><td><b>#${esc(o.code)}</b><div class="muted small">${fmtDate(o.created_at)}</div></td>
      <td>${esc(o.customer_name)}<div class="muted small">${esc(o.phone)} · ${esc(o.city)}</div></td>
      <td class="small">${o.items.map(i => `${esc(i.icon)} ${esc(i.name)} ×${i.qty}`).join('<br>')}</td>
      <td><b>${tk(o.total)}</b></td>
      <td class="small">${esc(o.delivery_label.split('(')[0])}<br>${o.payment_method === 'cod' ? 'COD' : 'bKash ' + esc(o.payment_ref || '')} · <i>${esc(o.payment_status)}</i></td>
      <td><select onchange="updateOrder(${o.id},{status:this.value})">${state.config.statuses.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td><button class="btn btn-ghost btn-sm" onclick="orderModal(${o.id})">Details</button></td></tr>`; }).join('')}</table>`
      : '<div class="empty"><div class="big">📭</div><p class="muted">No orders found.</p></div>'}</div>`;
  let t; $('#oq').oninput = e => { admin.orderQ = e.target.value; clearTimeout(t); t = setTimeout(() => adminOrders().then(() => { const i = $('#oq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }), 350); };
  $('#os').onchange = e => { admin.orderStatus = e.target.value; adminOrders(); };
}
window.updateOrder = async (id, body, inModal) => {
  try { const { order } = await api('admin/orders/' + id, { method: 'PUT', body }); toast(`Order #${order.code} updated`, 'ok'); window['_o' + id] = order; if (inModal) orderModal(id); if (admin.tab === 'orders') adminOrders(); }
  catch (e) { toast(e.message, 'bad'); if (admin.tab === 'orders') adminOrders(); }
};
window.orderModal = id => {
  const o = window['_o' + id];
  openModal(`<div class="admin-head"><h2>Order #${esc(o.code)}</h2>${statusPill(o.status)}</div>
    <div class="two">
      <div><h4>Customer</h4><p><b>${esc(o.customer_name)}</b><br>📞 ${esc(o.phone)}<br>✉️ ${esc(o.email || '—')}<br>📍 ${esc(o.address)}, ${esc(o.city)}${o.note ? `<br>📝 ${esc(o.note)}` : ''}</p>
        ${o.user_id ? `<p class="small muted">Account: ${esc(o.account_name)} (${esc(o.account_email)}) · <a class="link" href="javascript:userModal(${o.user_id})">view customer</a></p>` : ''}</div>
      <div><h4>Delivery & payment</h4><p>${esc(o.delivery_label)}<br>${o.payment_method === 'cod' ? 'Cash on Delivery' : 'bKash · TrxID: <b>' + esc(o.payment_ref) + '</b>'}<br>Payment: <b>${esc(o.payment_status)}</b></p>
        <select id="payS">${['Unpaid', 'Verification pending', 'Paid', 'Refunded'].map(s => `<option ${s === o.payment_status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <button class="btn btn-ghost btn-sm" onclick="updateOrder(${o.id},{payment_status:$('#payS').value},true)">Update payment</button></div>
    </div>
    <h4>Items</h4>${o.items.map(i => `<div class="mini"><span>${esc(i.icon)} ${esc(i.name)} × ${i.qty} @ ${tk(i.price)}</span><span>${tk(i.price * i.qty)}</span></div>`).join('')}
    <div class="mini muted"><span>Subtotal</span><span>${tk(o.subtotal)}</span></div>
    ${o.discount ? `<div class="mini muted"><span>Discount ${o.coupon ? '(' + esc(o.coupon) + ')' : ''}</span><span>−${tk(o.discount)}</span></div>` : ''}
    <div class="mini muted"><span>Delivery</span><span>${tk(o.delivery_fee)}</span></div>
    <div class="mini"><b>Total</b><b>${tk(o.total)}</b></div>
    <h4>Update status</h4>
    <div class="row-btns"><select id="stS">${state.config.statuses.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <input class="inp" id="stN" placeholder="Note (optional, e.g. rider name)" style="flex:1">
      <button class="btn btn-primary btn-sm" onclick="updateOrder(${o.id},{status:$('#stS').value,note:$('#stN').value},true)">Save</button></div>
    <h4>History</h4><div class="timeline">${o.events.map(ev => `<div><b>${esc(ev.status)}</b> <span class="muted small">${fmtDate(ev.created_at)}</span>${ev.note ? ` — <span class="small">${esc(ev.note)}</span>` : ''}</div>`).join('')}</div>
    <div class="actions"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>`, true);
};
async function adminProducts() {
  const { products } = await api('products?all=1&sort=new');
  const ql = admin.productQ.toLowerCase(); const list = products.filter(p => !ql || p.name.toLowerCase().includes(ql));
  products.forEach(p => productCache[p.id] = p);
  $('#adminBody').innerHTML = `<div class="toolbar"><input class="inp" id="pq" placeholder="Search products…" value="${esc(admin.productQ)}"><button class="btn btn-primary" onclick="editProduct()">+ Add product</button></div>
  <div class="card table-scroll"><table><tr><th></th><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr>
  ${list.map(p => `<tr><td><div class="thumb sm" style="background:${BG[p.category]}">${pimg(p)}</div></td><td><b>${esc(p.name)}</b>${p.featured ? ' <span class="pill">Featured</span>' : ''}</td><td>${esc(catName(p.category))}</td>
  <td>${tk(p.price)}${p.old_price > p.price ? `<div class="old">${tk(p.old_price)}</div>` : ''}</td><td>${p.stock <= 5 ? `<span class="pill ${p.stock ? 'warn' : 'bad'}">${p.stock}</span>` : p.stock}</td>
  <td>${p.active ? '<span class="pill ok">Live</span>' : '<span class="pill grey">Hidden</span>'}</td>
  <td class="nowrap"><button class="btn btn-ghost btn-sm" onclick="editProduct(${p.id})">Edit</button> <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})">Delete</button></td></tr>`).join('')}</table></div>`;
  $('#pq').oninput = e => { admin.productQ = e.target.value; adminProducts().then(() => { const i = $('#pq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); };
}
function resizeImage(file) {
  return new Promise((res, rej) => {
    const img = new Image(); img.onload = () => {
      const s = Math.min(1, 700 / Math.max(img.width, img.height)); const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.82)); URL.revokeObjectURL(img.src);
    }; img.onerror = () => rej(new Error('Could not read that image')); img.src = URL.createObjectURL(file);
  });
}
window.editProduct = id => {
  const p = id ? productCache[id] : { name: '', category: 'electronics', price: '', old_price: '', stock: 10, icon: '📦', image: '', description: '', featured: false, active: true };
  let image = p.image || '';
  openModal(`<h2>${id ? 'Edit' : 'Add'} product</h2><form id="pf">
    <div class="img-pick"><div class="thumb lg" id="imgPrev" style="background:${BG[p.category]}">${pimg(p)}</div>
      <div style="flex:1"><div class="field"><label>Product photo</label><input type="file" accept="image/*" id="imgFile"></div>
      <div class="field"><label>…or image URL (https)</label><input id="imgUrl" placeholder="https://…" value="${image.startsWith('http') ? esc(image) : ''}"></div>
      ${image ? '<button type="button" class="link-btn" id="imgClear">Remove photo</button>' : ''}</div></div>
    <div class="row"><div class="field" style="max-width:90px"><label>Icon</label><input name="icon" value="${esc(p.icon)}" maxlength="4" class="emoji-in"></div>
    <div class="field"><label>Name *</label><input name="name" value="${esc(p.name)}" required></div></div>
    <div class="row"><div class="field"><label>Category</label><select name="category">${state.config.categories.map(c => `<option value="${c.id}" ${c.id === p.category ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>
    <div class="field"><label>Stock *</label><input name="stock" type="number" min="0" value="${p.stock}"></div></div>
    <div class="row"><div class="field"><label>Price (৳) *</label><input name="price" type="number" min="1" step="0.01" value="${p.price}"></div>
    <div class="field"><label>Original price (for discount)</label><input name="old_price" type="number" min="0" step="0.01" value="${p.old_price || ''}"></div></div>
    <div class="field"><label>Description</label><textarea name="description" rows="3">${esc(p.description)}</textarea></div>
    <label class="check"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}> Show in featured products</label>
    <label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Visible in shop</label>
    <p class="err" id="pfErr"></p>
    <div class="actions"><button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary">Save product</button></div></form>`);
  const prev = () => $('#imgPrev').innerHTML = image ? `<img src="${esc(image)}">` : `<span class="ic">${esc($('[name=icon]').value || '📦')}</span>`;
  $('#imgFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { image = await resizeImage(f); $('#imgUrl').value = ''; prev(); } catch (err) { toast(err.message, 'bad'); } };
  $('#imgUrl').oninput = e => { image = e.target.value.trim(); prev(); };
  const c = $('#imgClear'); if (c) c.onclick = () => { image = ''; $('#imgUrl').value = ''; prev(); };
  $('#pf').onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); const b = e.submitter; busy(b, true, 'Saving…');
    try {
      await api(id ? 'admin/products/' + id : 'admin/products', { method: id ? 'PUT' : 'POST', body: { ...d, featured: !!d.featured, active: !!d.active, image: image || null } });
      closeModal(); toast('Product saved', 'ok'); adminProducts();
    } catch (err) { $('#pfErr').textContent = err.message; busy(b, false); }
  };
};
window.deleteProduct = id => confirmBox(`Delete "${productCache[id].name}"? Tip: untick "Visible in shop" instead if you just want to hide it.`, async () => {
  try { await api('admin/products/' + id, { method: 'DELETE' }); toast('Product deleted'); adminProducts(); } catch (e) { toast(e.message, 'bad'); }
}, 'Delete');
async function adminCustomers() {
  const { users } = await api('admin/users' + (admin.userQ ? '?q=' + encodeURIComponent(admin.userQ) : ''));
  $('#adminBody').innerHTML = `<div class="toolbar"><input class="inp" id="uq" placeholder="Search name, email, phone…" value="${esc(admin.userQ)}"><span class="muted">${users.length} accounts</span></div>
  <div class="card table-scroll"><table><tr><th>Customer</th><th>Phone</th><th>Address</th><th>Orders</th><th>Spent</th><th>Joined</th><th></th></tr>
  ${users.map(u => `<tr><td><b>${esc(u.name)}</b>${u.role === 'admin' ? ' <span class="pill">Admin</span>' : ''}<div class="muted small">${esc(u.email)}</div></td><td>${esc(u.phone || '—')}</td>
  <td class="small">${esc([u.address, u.city].filter(Boolean).join(', ') || '—')}</td><td>${u.orders}</td><td>${tk(u.spent)}</td><td class="small">${new Date(u.created_at).toLocaleDateString()}</td>
  <td><button class="btn btn-ghost btn-sm" onclick="userModal(${u.id})">View</button></td></tr>`).join('')}</table></div>`;
  let t; $('#uq').oninput = e => { admin.userQ = e.target.value; clearTimeout(t); t = setTimeout(() => adminCustomers().then(() => { const i = $('#uq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }), 350); };
}
window.userModal = async id => {
  try {
    const { user: u, orders } = await api('admin/users/' + id);
    orders.forEach(o => window['_o' + o.id] = o);
    openModal(`<div class="admin-head"><h2>${esc(u.name)}</h2>${u.role === 'admin' ? '<span class="pill">Admin</span>' : ''}</div>
      <div class="two"><div><p>✉️ ${esc(u.email)}<br>📞 ${esc(u.phone || '—')}<br>📍 ${esc([u.address, u.city].filter(Boolean).join(', ') || '—')}<br><span class="muted small">Joined ${fmtDate(u.created_at)}</span></p></div>
      <div><p><b>${orders.length}</b> orders · <b>${tk(orders.filter(o => o.status !== 'Cancelled').reduce((a, o) => a + o.total, 0))}</b> spent</p>
      ${u.id !== state.user.id ? `<button class="btn btn-ghost btn-sm" onclick="setRole(${u.id},'${u.role === 'admin' ? 'customer' : 'admin'}')">${u.role === 'admin' ? 'Remove admin rights' : 'Make admin'}</button>` : ''}</div></div>
      <h4>Order history</h4>${orders.length ? orders.map(o => `<div class="mini"><span><a class="link" href="javascript:orderModal(${o.id})">#${esc(o.code)}</a> · ${fmtDate(o.created_at)} · ${o.items.length} item(s)</span><span>${statusPill(o.status)} <b>${tk(o.total)}</b></span></div>`).join('') : '<p class="muted">No orders yet.</p>'}
      <div class="actions"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>`, true);
  } catch (e) { toast(e.message, 'bad'); }
};
window.setRole = (id, role) => confirmBox(role === 'admin' ? 'Give this user full admin access?' : 'Remove admin rights from this user?', async () => {
  try { await api(`admin/users/${id}/role`, { method: 'PUT', body: { role } }); toast('Role updated', 'ok'); adminCustomers(); } catch (e) { toast(e.message, 'bad'); }
});

/* ================= ROUTER ================= */
let lastPage = '';
async function route() {
  const h = location.hash.slice(1) || 'home';
  const page = h.split('-')[0], arg = h.split('-').slice(1).join('-');
  $('#navlinks').classList.remove('open'); closeModal();
  if (page !== lastPage) window.scrollTo(0, 0);
  lastPage = page; renderNav();
  const pages = { home: renderHome, shop: renderShop, product: () => renderProduct(arg), cart: renderCart, checkout: renderCheckout, success: renderSuccess,
    orders: renderOrders, wishlist: renderWishlist, login: () => renderLogin(), signup: () => renderLogin('signup'), account: renderAccount, admin: () => renderAdmin(), track: renderTrack };
  if (page !== 'shop' && $('#shopGrid')) $('#app').innerHTML = '';
  await (pages[page] || renderHome)();
}
window.addEventListener('hashchange', route);
Object.assign(window, { route, renderLogin, renderAdmin, toggleWish, closeModal, state, admin, $ });

(async function boot() {
  loading();
  try {
    state.config = await api('config');
    if (ls.get('token', null)) { try { state.user = (await api('auth/me')).user; } catch {} }
  } catch (e) { $('#app').innerHTML = errorBox('The store server is not reachable: ' + e.message); return; }
  route();
})();
