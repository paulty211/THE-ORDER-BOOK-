# THE ORDER BOOK (TOB)

A simple, offline-first mobile app (installable PWA) for food vendors, tailors and other small businesses to record
customer orders, deposits, balances and collection dates.

## Screens
1. **Orders** – pending orders sorted by collection date (overdue / due today / soon highlighted), balance still to collect, search, and a Completed tab.
2. **Add Order** – customer, phone (optional), order, total amount, deposit and collection date, with a live balance.
3. **Order Details** – record further payments (or pay the full balance), see payment history, mark the order completed (or reopen / delete it).

## Using it
Open the site on your phone, then **Add to Home Screen** (Share → Add to Home Screen on iPhone, ⋮ → Install app on Android).
It works offline. Data is stored only on your device (localStorage) – clearing browser data erases it.

## Develop
No build step: static `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`. Serve with any static server, e.g. `python3 -m http.server`.

## Online registration (optional)
Businesses can also be registered in one online table (Supabase). See [SETUP-CLOUD.md](SETUP-CLOUD.md). Only the business profile is uploaded; orders and customers stay on the phone.
