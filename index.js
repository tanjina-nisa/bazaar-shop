// Bazaar API — single Vercel serverless function handling every /api/* route.
const { Pool } = require('pg');
const crypto = require('crypto');

/* ---------------- DB ---------------- */
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const isLocal = /localhost|127\.0\.0\.1|\/var\/run|host=\//.test(DB_URL);
let pool;
function db() {
  if (!pool) {
    if (!DB_URL) throw httpErr(500, 'Database is not configured (DATABASE_URL missing).');
    pool = new Pool({ connectionString: DB_URL, ssl: isLocal ? false : { rejectUnauthorized: false }, max: 3 });
  }
  return pool;
}
const q = (text, params) => db().query(text, params);

const JWT_SECRET = process.env.JWT_SECRET || crypto.createHash('sha256').update('bazaar:' + DB_URL).digest('hex');
// Optional: pre-create an admin from env vars. Otherwise the FIRST account registered becomes the store owner (admin).
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

const CATEGORIES = [
  { id: 'electronics', name: 'Electronics', icon: '🎧' },
  { id: 'fashion', name: 'Fashion', icon: '👗' },
  { id: 'home', name: 'Home & Living', icon: '🛋️' },
  { id: 'beauty', name: 'Beauty', icon: '💄' },
  { id: 'books', name: 'Books', icon: '📚' },
  { id: 'grocery', name: 'Grocery', icon: '🥭' }
];
const DELIVERY = {
  inside_dhaka: { label: 'Standard — Inside Dhaka (1–2 days)', fee: 60 },
  outside_dhaka: { label: 'Standard — Outside Dhaka (3–5 days)', fee: 120 },
  express: { label: 'Express — Same day (Dhaka only)', fee: 150 },
  pickup: { label: 'Store pickup (Dhanmondi outlet)', fee: 0 }
};
const FREE_SHIP_MIN = 3000;
const COUPONS = {
  SAVE10: { type: 'pct', value: 10, label: '10% off' },
  WELCOME100: { type: 'flat', value: 100, min: 1000, label: '৳100 off orders over ৳1000' },
  FREESHIP: { type: 'ship', value: 0, label: 'Free delivery' }
};
const STATUSES = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

const SEED = [
  ['Wireless Earbuds Pro', 'electronics', 2490, 3200, 25, '🎧', 'Bluetooth 5.3 earbuds with active noise cancellation, 30-hour battery with case and IPX5 water resistance.', true],
  ['Smart Watch Fit 2', 'electronics', 3990, 4800, 14, '⌚', '1.8" AMOLED display, heart-rate & SpO2 tracking, 100+ sport modes and 10-day battery life.', true],
  ['Power Bank 20000mAh', 'electronics', 1650, 0, 40, '🔋', 'Fast-charging 22.5W power bank with dual USB + Type-C output.', false],
  ['Mechanical Keyboard', 'electronics', 4500, 5200, 8, '⌨️', 'Hot-swappable 75% keyboard with RGB backlight and tactile brown switches.', false],
  ['Cotton Panjabi', 'fashion', 1850, 2200, 30, '👘', 'Breathable premium cotton panjabi, perfect for Eid and festive occasions. Sizes M–XXL.', true],
  ['Printed Kurti', 'fashion', 1290, 0, 22, '👗', 'Soft viscose kurti with block print design. Comfortable everyday wear.', false],
  ['Canvas Sneakers', 'fashion', 2200, 2600, 18, '👟', 'Lightweight canvas sneakers with cushioned insole. Unisex.', false],
  ['Leather Backpack', 'fashion', 3350, 0, 10, '🎒', 'Genuine leather backpack with padded 15.6" laptop sleeve.', false],
  ['Ceramic Table Lamp', 'home', 1750, 2100, 12, '🪔', 'Handcrafted ceramic lamp with warm linen shade. Bulb included.', false],
  ['Nakshi Cushion Cover (2 pcs)', 'home', 890, 0, 35, '🛋️', 'Hand-embroidered nakshi kantha cushion covers, 16x16 inches.', true],
  ['Snake Plant (Indoor)', 'home', 650, 0, 20, '🪴', 'Low-maintenance air-purifying plant in a ceramic pot.', false],
  ['Vitamin C Serum', 'beauty', 950, 1200, 28, '🧴', '15% vitamin C serum for brighter, even-toned skin. 30ml.', false],
  ['Matte Lipstick Set', 'beauty', 1150, 0, 16, '💄', 'Set of 4 long-lasting matte shades.', false],
  ['Clean Code (Paperback)', 'books', 780, 950, 15, '📘', "Robert C. Martin's classic handbook of agile software craftsmanship.", false],
  ['Bangla Short Stories Collection', 'books', 420, 0, 25, '📗', 'An anthology of classic Bangla short stories.', false],
  ['Rajshahi Mango (5 kg)', 'grocery', 850, 1000, 50, '🥭', 'Fresh Himsagar mangoes directly from Rajshahi orchards.', true],
  ['Sundarban Honey 500g', 'grocery', 690, 0, 30, '🍯', 'Pure natural honey collected from the Sundarbans.', false],
  ['Premium Tea Leaves 400g', 'grocery', 380, 450, 45, '🍵', 'Strong, aromatic Sylhet tea leaves.', false]
];

let ready;
function init() {
  if (!ready) ready = (async () => {
    await q(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
        phone TEXT, address TEXT, city TEXT, role TEXT NOT NULL DEFAULT 'customer', created_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, price NUMERIC(12,2) NOT NULL,
        old_price NUMERIC(12,2) DEFAULT 0, stock INT NOT NULL DEFAULT 0, icon TEXT DEFAULT '📦', image TEXT,
        description TEXT DEFAULT '', featured BOOLEAN DEFAULT false, active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, user_id INT REFERENCES users(id),
        customer_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, address TEXT NOT NULL, city TEXT NOT NULL, note TEXT,
        delivery_method TEXT NOT NULL, delivery_fee NUMERIC(12,2) NOT NULL, subtotal NUMERIC(12,2) NOT NULL,
        discount NUMERIC(12,2) NOT NULL DEFAULT 0, total NUMERIC(12,2) NOT NULL, coupon TEXT,
        payment_method TEXT NOT NULL, payment_ref TEXT, payment_status TEXT NOT NULL DEFAULT 'Unpaid',
        status TEXT NOT NULL DEFAULT 'Pending', created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY, order_id INT REFERENCES orders(id) ON DELETE CASCADE, product_id INT,
        name TEXT NOT NULL, icon TEXT, price NUMERIC(12,2) NOT NULL, qty INT NOT NULL);
      CREATE TABLE IF NOT EXISTS order_events (
        id SERIAL PRIMARY KEY, order_id INT REFERENCES orders(id) ON DELETE CASCADE, status TEXT NOT NULL,
        note TEXT, created_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY, product_id INT REFERENCES products(id) ON DELETE CASCADE, user_id INT REFERENCES users(id),
        user_name TEXT, stars INT NOT NULL CHECK (stars BETWEEN 1 AND 5), body TEXT, created_at TIMESTAMPTZ DEFAULT now());
    `);
    const { rows } = await q('SELECT COUNT(*)::int n FROM products');
    if (rows[0].n === 0) {
      for (const s of SEED) await q('INSERT INTO products (name,category,price,old_price,stock,icon,description,featured) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', s);
    }
    const a = ADMIN_EMAIL && ADMIN_PASSWORD ? await q('SELECT id FROM users WHERE email=$1', [ADMIN_EMAIL]) : { rows: [1] };
    if (!a.rows.length) await q("INSERT INTO users (name,email,password_hash,role) VALUES ('Store Admin',$1,$2,'admin')", [ADMIN_EMAIL, hashPassword(ADMIN_PASSWORD)]);
  })().catch(e => { ready = null; throw e; });
  return ready;
}

/* ---------------- helpers ---------------- */
function httpErr(status, message) { const e = new Error(message); e.status = status; return e; }
function hashPassword(pw) { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'); }
function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':'); if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex'), b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const b64u = b => Buffer.from(b).toString('base64url');
function signToken(payload) {
  const body = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14 }));
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  return `${head}.${body}.${crypto.createHmac('sha256', JWT_SECRET).update(head + '.' + body).digest('base64url')}`;
}
function readToken(req) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const [h, b, s] = t.split('.'); if (!s) return null;
  const good = crypto.createHmac('sha256', JWT_SECRET).update(h + '.' + b).digest('base64url');
  if (good.length !== s.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(s))) return null;
  try { const p = JSON.parse(Buffer.from(b, 'base64url').toString()); return p.exp > Date.now() / 1000 ? p : null; } catch { return null; }
}
async function currentUser(req, required = true) {
  const t = readToken(req);
  if (!t) { if (required) throw httpErr(401, 'Please log in first.'); return null; }
  const { rows } = await q('SELECT id,name,email,phone,address,city,role,created_at FROM users WHERE id=$1', [t.uid]);
  if (!rows.length) { if (required) throw httpErr(401, 'Session expired. Please log in again.'); return null; }
  return rows[0];
}
async function requireAdmin(req) { const u = await currentUser(req); if (u.role !== 'admin') throw httpErr(403, 'Admin access only.'); return u; }
const num = v => Number(v);
const money = n => Math.round(Number(n) * 100) / 100;
const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const isEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const isBDPhone = p => /^(\+?88)?01[3-9]\d{8}$/.test(String(p).replace(/[\s-]/g, ''));

function productOut(r) {
  return { id: r.id, name: r.name, category: r.category, price: num(r.price), old_price: num(r.old_price), stock: r.stock,
    icon: r.icon, image: r.image, description: r.description, featured: r.featured, active: r.active,
    rating: r.rating ? Number(Number(r.rating).toFixed(1)) : 0, reviews: r.review_count || 0 };
}
function validateProduct(b) {
  const p = {
    name: clean(b.name, 120), category: clean(b.category, 40), price: money(b.price), old_price: money(b.old_price || 0),
    stock: Math.max(0, parseInt(b.stock, 10) || 0), icon: clean(b.icon || '📦', 8), description: clean(b.description, 2000),
    featured: !!b.featured, active: b.active === undefined ? true : !!b.active, image: b.image ? String(b.image) : null
  };
  if (p.name.length < 2) throw httpErr(400, 'Product name is required.');
  if (!CATEGORIES.some(c => c.id === p.category)) throw httpErr(400, 'Invalid category.');
  if (!(p.price > 0)) throw httpErr(400, 'Price must be greater than 0.');
  if (p.image && !/^(https:\/\/|data:image\/(png|jpe?g|webp|gif);base64,)/.test(p.image)) throw httpErr(400, 'Image must be an https URL or an uploaded image.');
  if (p.image && p.image.length > 900000) throw httpErr(400, 'Image is too large (max ~600KB).');
  return p;
}
async function orderDetail(id) {
  const o = (await q('SELECT o.*, u.email AS account_email, u.name AS account_name FROM orders o LEFT JOIN users u ON u.id=o.user_id WHERE o.id=$1', [id])).rows[0];
  if (!o) return null;
  const items = (await q('SELECT product_id,name,icon,price,qty FROM order_items WHERE order_id=$1 ORDER BY id', [id])).rows.map(i => ({ ...i, price: num(i.price) }));
  const events = (await q('SELECT status,note,created_at FROM order_events WHERE order_id=$1 ORDER BY id', [id])).rows;
  return { ...o, subtotal: num(o.subtotal), discount: num(o.discount), delivery_fee: num(o.delivery_fee), total: num(o.total),
    delivery_label: DELIVERY[o.delivery_method]?.label || o.delivery_method, items, events };
}
function quote(items, deliveryMethod, couponCode) {
  const sub = money(items.reduce((a, i) => a + i.price * i.qty, 0));
  const d = DELIVERY[deliveryMethod]; if (!d) throw httpErr(400, 'Please choose a delivery method.');
  let fee = sub >= FREE_SHIP_MIN && deliveryMethod !== 'express' ? 0 : d.fee, disc = 0;
  const code = couponCode ? clean(couponCode, 30).toUpperCase() : null;
  if (code) {
    const c = COUPONS[code]; if (!c) throw httpErr(400, 'Invalid coupon code.');
    if (c.min && sub < c.min) throw httpErr(400, `Coupon ${code} needs a minimum order of ৳${c.min}.`);
    if (c.type === 'pct') disc = money(sub * c.value / 100);
    if (c.type === 'flat') disc = c.value;
    if (c.type === 'ship') fee = 0;
  }
  return { subtotal: sub, discount: disc, delivery_fee: fee, total: money(Math.max(0, sub - disc + fee)), coupon: code };
}

/* ---------------- routes ---------------- */
const routes = [];
const route = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

route('GET', '/health', async () => ({ ok: true }));
route('GET', '/config', async () => ({ needsOwner: !(await q("SELECT 1 FROM users WHERE role='admin' LIMIT 1")).rows.length, categories: CATEGORIES, delivery: DELIVERY, freeShipMin: FREE_SHIP_MIN,
  coupons: Object.entries(COUPONS).map(([code, c]) => ({ code, label: c.label })), statuses: STATUSES }));

// ---- auth
route('POST', '/auth/register', async ({ body }) => {
  const name = clean(body.name, 80), email = clean(body.email, 120).toLowerCase(), pw = String(body.password || '');
  if (name.length < 2) throw httpErr(400, 'Please enter your name.');
  if (!isEmail(email)) throw httpErr(400, 'Please enter a valid email.');
  if (pw.length < 6) throw httpErr(400, 'Password must be at least 6 characters.');
  if (body.phone && !isBDPhone(body.phone)) throw httpErr(400, 'Enter a valid BD phone number (01XXXXXXXXX).');
  const exists = await q('SELECT 1 FROM users WHERE email=$1', [email]);
  if (exists.rows.length) throw httpErr(409, 'An account with this email already exists.');
  // First account on a fresh store becomes the owner/admin (atomic: only if no admin exists yet).
  const { rows } = await q(`INSERT INTO users (name,email,password_hash,phone,role)
    VALUES ($1,$2,$3,$4, CASE WHEN EXISTS (SELECT 1 FROM users WHERE role='admin') THEN 'customer' ELSE 'admin' END)
    RETURNING id,name,email,phone,address,city,role`, [name, email, hashPassword(pw), clean(body.phone, 20) || null]);
  return { token: signToken({ uid: rows[0].id }), user: rows[0] };
});
route('POST', '/auth/login', async ({ body }) => {
  const email = clean(body.email, 120).toLowerCase();
  const { rows } = await q('SELECT * FROM users WHERE email=$1', [email]);
  if (!rows.length || !verifyPassword(String(body.password || ''), rows[0].password_hash)) throw httpErr(401, 'Wrong email or password.');
  const { password_hash, ...user } = rows[0];
  return { token: signToken({ uid: user.id }), user };
});
route('GET', '/auth/me', async ({ req }) => ({ user: await currentUser(req) }));
route('PUT', '/auth/me', async ({ req, body }) => {
  const u = await currentUser(req);
  if (body.phone && !isBDPhone(body.phone)) throw httpErr(400, 'Enter a valid BD phone number.');
  if (body.newPassword) {
    const r = (await q('SELECT password_hash FROM users WHERE id=$1', [u.id])).rows[0];
    if (!verifyPassword(String(body.currentPassword || ''), r.password_hash)) throw httpErr(400, 'Current password is wrong.');
    if (String(body.newPassword).length < 6) throw httpErr(400, 'New password must be at least 6 characters.');
    await q('UPDATE users SET password_hash=$1 WHERE id=$2', [hashPassword(String(body.newPassword)), u.id]);
  }
  const { rows } = await q(`UPDATE users SET name=COALESCE(NULLIF($1,''),name), phone=$2, address=$3, city=$4 WHERE id=$5
    RETURNING id,name,email,phone,address,city,role`, [clean(body.name, 80), clean(body.phone, 20) || null, clean(body.address) || null, clean(body.city, 60) || null, u.id]);
  return { user: rows[0] };
});

// ---- products (public)
route('GET', '/products', async ({ query, req }) => {
  const admin = query.all === '1' ? await requireAdmin(req) : null;
  const where = [], p = [];
  if (!admin) where.push('p.active = true');
  if (query.q) { p.push('%' + query.q + '%'); where.push(`(p.name ILIKE $${p.length} OR p.description ILIKE $${p.length})`); }
  if (query.category) { p.push(String(query.category).split(',')); where.push(`p.category = ANY($${p.length})`); }
  if (query.max) { p.push(num(query.max)); where.push(`p.price <= $${p.length}`); }
  if (query.instock === '1') where.push('p.stock > 0');
  if (query.featured === '1') where.push('p.featured = true');
  if (query.deals === '1') where.push('p.old_price > p.price');
  const sort = { low: 'p.price ASC', high: 'p.price DESC', name: 'p.name ASC', rating: 'rating DESC NULLS LAST', new: 'p.created_at DESC',
    deals: '(p.old_price - p.price) / NULLIF(p.old_price,0) DESC NULLS LAST' }[query.sort] || 'p.featured DESC, p.id ASC';
  const limit = Math.min(parseInt(query.limit, 10) || 200, 200);
  const { rows } = await q(`SELECT p.*, AVG(r.stars) rating, COUNT(r.id)::int review_count FROM products p
    LEFT JOIN reviews r ON r.product_id=p.id ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    GROUP BY p.id ORDER BY ${sort} LIMIT ${limit}`, p);
  return { products: rows.map(productOut) };
});
route('GET', '/products/:id', async ({ params }) => {
  const { rows } = await q(`SELECT p.*, AVG(r.stars) rating, COUNT(r.id)::int review_count FROM products p
    LEFT JOIN reviews r ON r.product_id=p.id WHERE p.id=$1 AND p.active GROUP BY p.id`, [parseInt(params.id, 10) || 0]);
  if (!rows.length) throw httpErr(404, 'Product not found.');
  const reviews = (await q('SELECT user_name,stars,body,created_at FROM reviews WHERE product_id=$1 ORDER BY id DESC LIMIT 50', [rows[0].id])).rows;
  return { product: productOut(rows[0]), reviews };
});
route('POST', '/products/:id/reviews', async ({ req, params, body }) => {
  const u = await currentUser(req);
  const stars = parseInt(body.stars, 10); if (!(stars >= 1 && stars <= 5)) throw httpErr(400, 'Rating must be 1–5.');
  const text = clean(body.body, 600); if (text.length < 2) throw httpErr(400, 'Please write a short review.');
  const p = await q('SELECT id FROM products WHERE id=$1', [parseInt(params.id, 10) || 0]); if (!p.rows.length) throw httpErr(404, 'Product not found.');
  await q('INSERT INTO reviews (product_id,user_id,user_name,stars,body) VALUES ($1,$2,$3,$4,$5)', [p.rows[0].id, u.id, u.name, stars, text]);
  return { ok: true };
});

// ---- cart pricing (server truth)
route('POST', '/cart/quote', async ({ body }) => {
  const lines = Array.isArray(body.items) ? body.items : [];
  const ids = lines.map(l => parseInt(l.id, 10)).filter(Boolean);
  const { rows } = ids.length ? await q('SELECT * FROM products WHERE id = ANY($1) AND active', [ids]) : { rows: [] };
  const items = [], issues = [];
  for (const l of lines) {
    const p = rows.find(r => r.id === parseInt(l.id, 10));
    if (!p) { issues.push({ id: l.id, msg: 'No longer available' }); continue; }
    let qty = Math.max(1, parseInt(l.qty, 10) || 1);
    if (p.stock <= 0) { issues.push({ id: p.id, msg: `${p.name} is out of stock` }); continue; }
    if (qty > p.stock) { issues.push({ id: p.id, msg: `Only ${p.stock} of ${p.name} available` }); qty = p.stock; }
    items.push({ ...productOut(p), qty });
  }
  let totals, couponError = null;
  try { totals = quote(items, body.delivery || 'inside_dhaka', body.coupon); }
  catch (e) { couponError = e.message; totals = quote(items, body.delivery || 'inside_dhaka', null); }
  return { items, issues, ...totals, couponError };
});

// ---- orders (customer)
route('POST', '/orders', async ({ req, body }) => {
  const u = await currentUser(req);
  const c = body.customer || {};
  const cust = { name: clean(c.name, 80), phone: clean(c.phone, 20), email: clean(c.email || u.email, 120), address: clean(c.address, 300), city: clean(c.city, 60), note: clean(c.note, 300) };
  if (cust.name.length < 2) throw httpErr(400, 'Please enter the receiver name.');
  if (!isBDPhone(cust.phone)) throw httpErr(400, 'Enter a valid BD phone number (01XXXXXXXXX).');
  if (body.delivery !== 'pickup' && cust.address.length < 6) throw httpErr(400, 'Please enter the full delivery address.');
  if (!cust.city) throw httpErr(400, 'Please enter your city.');
  if (body.delivery === 'express' && !/dhaka/i.test(cust.city)) throw httpErr(400, 'Express delivery is only available inside Dhaka.');
  if (body.delivery === 'inside_dhaka' && !/dhaka/i.test(cust.city)) throw httpErr(400, 'City is outside Dhaka — choose "Outside Dhaka" delivery.');
  const pay = body.payment === 'bkash' ? 'bkash' : 'cod';
  const ref = clean(body.paymentRef, 40);
  if (pay === 'bkash' && ref.length < 8) throw httpErr(400, 'Please enter a valid bKash transaction ID.');
  const lines = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  if (!lines.length) throw httpErr(400, 'Your cart is empty.');

  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const items = [];
    for (const l of lines) {
      const qty = parseInt(l.qty, 10); const id = parseInt(l.id, 10);
      if (!(qty > 0)) throw httpErr(400, 'Invalid quantity.');
      const r = (await client.query('SELECT * FROM products WHERE id=$1 AND active FOR UPDATE', [id])).rows[0];
      if (!r) throw httpErr(400, 'A product in your cart is no longer available.');
      if (r.stock < qty) throw httpErr(409, `Only ${r.stock} of "${r.name}" left in stock.`);
      items.push({ id: r.id, name: r.name, icon: r.icon, price: num(r.price), qty });
    }
    const t = quote(items, body.delivery, body.coupon);
    for (const i of items) await client.query('UPDATE products SET stock = stock - $1, updated_at=now() WHERE id=$2', [i.qty, i.id]);
    const code = 'BZ' + Date.now().toString(36).toUpperCase().slice(-5) + crypto.randomBytes(2).toString('hex').toUpperCase();
    const o = (await client.query(`INSERT INTO orders (code,user_id,customer_name,phone,email,address,city,note,delivery_method,delivery_fee,subtotal,discount,total,coupon,payment_method,payment_ref,payment_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [code, u.id, cust.name, cust.phone, cust.email, cust.address || 'Store pickup', cust.city, cust.note, body.delivery, t.delivery_fee, t.subtotal, t.discount, t.total, t.coupon, pay, ref || null,
       pay === 'bkash' ? 'Verification pending' : 'Unpaid'])).rows[0];
    for (const i of items) await client.query('INSERT INTO order_items (order_id,product_id,name,icon,price,qty) VALUES ($1,$2,$3,$4,$5,$6)', [o.id, i.id, i.name, i.icon, i.price, i.qty]);
    await client.query("INSERT INTO order_events (order_id,status,note) VALUES ($1,'Pending','Order placed')", [o.id]);
    if (body.saveAddress) await client.query('UPDATE users SET phone=$1,address=$2,city=$3 WHERE id=$4', [cust.phone, cust.address || null, cust.city, u.id]);
    await client.query('COMMIT');
    return { order: await orderDetail(o.id) };
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
});
route('GET', '/orders/mine', async ({ req }) => {
  const u = await currentUser(req);
  const { rows } = await q('SELECT id FROM orders WHERE user_id=$1 ORDER BY id DESC', [u.id]);
  return { orders: await Promise.all(rows.map(r => orderDetail(r.id))) };
});
route('GET', '/orders/track', async ({ query }) => {
  const r = (await q('SELECT id, phone FROM orders WHERE upper(code)=upper($1)', [clean(query.code, 30)])).rows[0];
  const last = s => String(s || '').replace(/\D/g, '').slice(-10);
  if (!r || last(r.phone) !== last(query.phone) || !last(query.phone)) throw httpErr(404, 'No order found with those details.');
  const o = await orderDetail(r.id);
  return { order: { code: o.code, status: o.status, total: o.total, delivery_label: o.delivery_label, events: o.events, items: o.items, created_at: o.created_at } };
});
async function setOrderStatus(id, status, note) {
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const o = (await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!o) throw httpErr(404, 'Order not found.');
    if (o.status === status) { await client.query('ROLLBACK'); return; }
    const items = (await client.query('SELECT product_id,qty FROM order_items WHERE order_id=$1', [id])).rows;
    if (status === 'Cancelled') for (const i of items) await client.query('UPDATE products SET stock=stock+$1 WHERE id=$2', [i.qty, i.product_id]);
    if (o.status === 'Cancelled') for (const i of items) {
      const r = await client.query('UPDATE products SET stock=stock-$1 WHERE id=$2 AND stock >= $1', [i.qty, i.product_id]);
      if (!r.rowCount) throw httpErr(409, 'Not enough stock to re-open this order.');
    }
    await client.query('UPDATE orders SET status=$1, updated_at=now() WHERE id=$2', [status, id]);
    await client.query('INSERT INTO order_events (order_id,status,note) VALUES ($1,$2,$3)', [id, status, note || null]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
  finally { client.release(); }
}
route('POST', '/orders/:id/cancel', async ({ req, params }) => {
  const u = await currentUser(req);
  const o = (await q('SELECT * FROM orders WHERE id=$1 AND user_id=$2', [parseInt(params.id, 10) || 0, u.id])).rows[0];
  if (!o) throw httpErr(404, 'Order not found.');
  if (!['Pending', 'Confirmed'].includes(o.status)) throw httpErr(400, 'This order can no longer be cancelled.');
  await setOrderStatus(o.id, 'Cancelled', 'Cancelled by customer');
  return { order: await orderDetail(o.id) };
});

// ---- admin
route('GET', '/admin/stats', async ({ req }) => {
  await requireAdmin(req);
  const s = (await q(`SELECT
    (SELECT COALESCE(SUM(total),0) FROM orders WHERE status <> 'Cancelled') revenue,
    (SELECT COUNT(*)::int FROM orders) orders,
    (SELECT COUNT(*)::int FROM orders WHERE status='Pending') pending,
    (SELECT COUNT(*)::int FROM products) products,
    (SELECT COUNT(*)::int FROM products WHERE stock <= 5) low_stock,
    (SELECT COUNT(*)::int FROM users WHERE role='customer') customers,
    (SELECT COALESCE(SUM(total),0) FROM orders WHERE status <> 'Cancelled' AND created_at > now() - interval '1 day') today`)).rows[0];
  const top = (await q(`SELECT name, SUM(qty)::int sold FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status<>'Cancelled'
    GROUP BY name ORDER BY sold DESC LIMIT 5`)).rows;
  return { ...s, revenue: num(s.revenue), today: num(s.today), top };
});
route('POST', '/admin/products', async ({ req, body }) => {
  await requireAdmin(req); const p = validateProduct(body);
  const { rows } = await q(`INSERT INTO products (name,category,price,old_price,stock,icon,image,description,featured,active)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [p.name, p.category, p.price, p.old_price, p.stock, p.icon, p.image, p.description, p.featured, p.active]);
  return { product: productOut(rows[0]) };
});
route('PUT', '/admin/products/:id', async ({ req, params, body }) => {
  await requireAdmin(req); const p = validateProduct(body);
  const { rows } = await q(`UPDATE products SET name=$1,category=$2,price=$3,old_price=$4,stock=$5,icon=$6,image=$7,description=$8,featured=$9,active=$10,updated_at=now()
    WHERE id=$11 RETURNING *`, [p.name, p.category, p.price, p.old_price, p.stock, p.icon, p.image, p.description, p.featured, p.active, parseInt(params.id, 10) || 0]);
  if (!rows.length) throw httpErr(404, 'Product not found.');
  return { product: productOut(rows[0]) };
});
route('DELETE', '/admin/products/:id', async ({ req, params }) => {
  await requireAdmin(req);
  const r = await q('DELETE FROM products WHERE id=$1', [parseInt(params.id, 10) || 0]);
  if (!r.rowCount) throw httpErr(404, 'Product not found.');
  return { ok: true };
});
route('GET', '/admin/orders', async ({ req, query }) => {
  await requireAdmin(req);
  const p = [], where = [];
  if (query.status) { p.push(query.status); where.push(`status=$${p.length}`); }
  if (query.q) { p.push('%' + query.q + '%'); where.push(`(code ILIKE $${p.length} OR customer_name ILIKE $${p.length} OR phone ILIKE $${p.length})`); }
  const { rows } = await q(`SELECT id FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 200`, p);
  return { orders: await Promise.all(rows.map(r => orderDetail(r.id))) };
});
route('PUT', '/admin/orders/:id', async ({ req, params, body }) => {
  await requireAdmin(req); const id = parseInt(params.id, 10) || 0;
  if (body.status) { if (!STATUSES.includes(body.status)) throw httpErr(400, 'Invalid status.'); await setOrderStatus(id, body.status, clean(body.note, 200)); }
  if (body.payment_status) await q('UPDATE orders SET payment_status=$1, updated_at=now() WHERE id=$2', [clean(body.payment_status, 40), id]);
  const o = await orderDetail(id); if (!o) throw httpErr(404, 'Order not found.');
  return { order: o };
});
route('GET', '/admin/users', async ({ req, query }) => {
  await requireAdmin(req);
  const p = []; let w = '';
  if (query.q) { p.push('%' + query.q + '%'); w = 'WHERE u.name ILIKE $1 OR u.email ILIKE $1 OR u.phone ILIKE $1'; }
  const { rows } = await q(`SELECT u.id,u.name,u.email,u.phone,u.address,u.city,u.role,u.created_at,
    COUNT(o.id)::int orders, COALESCE(SUM(o.total) FILTER (WHERE o.status<>'Cancelled'),0) spent, MAX(o.created_at) last_order
    FROM users u LEFT JOIN orders o ON o.user_id=u.id ${w} GROUP BY u.id ORDER BY u.id DESC`, p);
  return { users: rows.map(r => ({ ...r, spent: num(r.spent) })) };
});
route('GET', '/admin/users/:id', async ({ req, params }) => {
  await requireAdmin(req); const id = parseInt(params.id, 10) || 0;
  const u = (await q('SELECT id,name,email,phone,address,city,role,created_at FROM users WHERE id=$1', [id])).rows[0];
  if (!u) throw httpErr(404, 'User not found.');
  const os = (await q('SELECT id FROM orders WHERE user_id=$1 ORDER BY id DESC', [id])).rows;
  return { user: u, orders: await Promise.all(os.map(r => orderDetail(r.id))) };
});
route('PUT', '/admin/users/:id/role', async ({ req, params, body }) => {
  const me = await requireAdmin(req); const id = parseInt(params.id, 10) || 0;
  if (id === me.id) throw httpErr(400, 'You cannot change your own role.');
  if (!['admin', 'customer'].includes(body.role)) throw httpErr(400, 'Invalid role.');
  await q('UPDATE users SET role=$1 WHERE id=$2', [body.role, id]);
  return { ok: true };
});

/* ---------------- handler ---------------- */
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return {}; }
}
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
  try {
    const url = new URL(req.url, 'http://x');
    let path = url.searchParams.get('path');
    path = '/' + (path !== null ? path : url.pathname.replace(/^\/api\/?/, '')).replace(/^\/+|\/+$/g, '');
    const query = Object.fromEntries(url.searchParams); delete query.path;
    const r = routes.find(r => r.method === req.method && r.re.test(path));
    if (!r) return send(404, { error: 'Not found' });
    await init();
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
    const data = await r.fn({ req, body, query, params: path.match(r.re).groups || {} });
    send(200, data);
  } catch (e) {
    if (!e.status) console.error(e);
    send(e.status || 500, { error: e.status ? e.message : 'Server error. Please try again.' });
  }
};
module.exports.config = { api: { bodyParser: { sizeLimit: '2mb' } } };
