# Bazaar — Full-stack E-commerce

Live: https://bazaar-online-shop.vercel.app

Frontend (HTML/CSS/JS SPA) + backend (Vercel serverless Node API) + PostgreSQL (Neon).

## Features
**Customers**
- Browse, search, filter by category/price/stock, sort
- Product pages with reviews & ratings, wishlist
- Cart (prices, stock and coupons verified by the server)
- Sign up / log in (scrypt-hashed passwords, JWT sessions), profile & saved address, change password
- Checkout with 4 delivery methods (Inside Dhaka, Outside Dhaka, Same-day Express, Store pickup) and payment by Cash on Delivery or bKash (TrxID)
- My Orders with progress tracker, cancel while Pending/Confirmed, public order tracking (order ID + phone)

**Admin** (`#admin`)
- Dashboard: revenue, last 24h, orders, pending, low stock, top sellers
- Products: add / edit / delete, photo upload or image URL, stock, discount price, featured, hide/show
- Orders: search & filter, full customer info (name, phone, email, address), items, change status with note (history timeline), mark bKash payment verified / paid / refunded. Cancelling returns stock.
- Customers: all accounts with phone, address, order count, total spent, order history; grant/revoke admin

## Structure
```
index.html   – page shell + styles
app.js       – frontend app
api/index.js – all API routes (/api/*), auto-creates tables & seeds products on first run
vercel.json  – routes /api/* to the function
```

## Environment variables (Vercel → Settings → Environment Variables)
| Name | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (added automatically by the Neon integration) |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD` | Optional — pre-create an admin. If not set, the **first account registered becomes the admin** |
| `JWT_SECRET` | Optional — session signing key (defaults to a key derived from `DATABASE_URL`) |

## Run locally
```
npm install
DATABASE_URL=postgres://... npx vercel dev
```
