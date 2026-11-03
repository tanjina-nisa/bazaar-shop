# Bazaar — E-commerce Site

Static, zero-dependency e-commerce site (HTML/CSS/JS). No build step.

## Features
- Product catalogue (18 products, 6 categories), search, category/price/stock filters, sorting
- Product pages with quantity, wishlist, customer reviews, related products
- Cart with quantity edit, coupons (SAVE10, WELCOME100, FREESHIP), Dhaka/outside delivery charge, free delivery over ৳3000
- Checkout with validation (BD phone format), Cash on Delivery or bKash (TrxID)
- Signup / login, My Orders, order cancel, order tracking by ID + phone
- Admin panel: revenue stats, order status management, add/edit/delete products, stock control
  - Admin login: admin@bazaar.com / admin123

## Deploy to Vercel
Option A (no install): go to https://vercel.com/new → "Deploy" → drag this folder (or push to GitHub and import).
Option B (CLI):
    npm i -g vercel
    vercel --prod

Note: data is stored in each visitor's browser (localStorage). For a shared database across all users,
connect a backend such as Supabase or Firebase.
