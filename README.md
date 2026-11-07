# Digital Menu — v1

QR-code menu and ordering for small Kerala hotels and tea shops.
Malayalam + English · no app to install · runs in any phone browser.

```
Waiter taps table on own phone ─► QR appears ─► customers scan it
Customer picks items ─► "ഓർഡർ അയക്കുക"
                                        │  (instantly)
                                        ▼
            Kitchen screen beeps, shows big TABLE number
            Cook taps  Preparing ─► Ready
                                        │
                                        ▼
            Waiter phone: "Ready to serve"  ─► Served
            Counter: bill per table ─► Paid (Cash / UPI) ─► today's total
            ─► the table's QR closes, the menu on customers' phones closes
```

### The menu is private (v1.2)
There are **no fixed QR stickers**, and the menu is **not public**.
- The waiter opens Waiter mode, taps the table, then taps **📱 Show QR**.
  Everyone at that table scans the same QR.
- With it they can keep ordering (food, then tea later) — no re-scan.
- When the counter marks the bill **Paid**, the QR closes. The menu on their
  phones changes to "Thank you, this table is closed", and the saved link
  shows nothing from home. Other shops can't browse the menu or prices.
- The waiter can also **Close table** (customers left without ordering),
  and a QR left unused for 6 hours closes by itself.
- The waiter can still take orders on their own phone without any QR.

## The 6 screens

| File | Who uses it | What it does |
|---|---|---|
| `menu.html?s=…` | Customer (only from the waiter's QR) | Menu with photos, prices, Veg/Non-veg mark, Malayalam/English. Cart, note for kitchen, live order status. Closes when the bill is paid. |
| `waiter.html` | Waiter, on own phone | Show the QR for a table, take orders, close a table. "Ready to serve" tab beeps when food is ready. |
| `kitchen.html` | Old tablet/phone on the kitchen wall | Big table numbers, beep on every new order (repeats until someone taps it), Start preparing → Ready. Keeps the screen awake. |
| `counter.html` | Cashier / owner | Open bill for each table, Paid · Cash / Paid · UPI, print bill, cancel a wrong order, today's sales (cash + UPI split). |
| `admin.html` | Owner, from phone | Out-of-stock switch, edit prices, add/edit items with photo, number of tables, hotel name. |
| `index.html` | You | Links to all screens. |

Staff screens need a login (live mode). The customer menu never needs a login.

**Upgrading from an older version?** Just run `supabase/schema.sql` again — it upgrades and keeps your menu and sales.

---

## 1. Try it right now (demo mode — no setup)

`js/config.js` is empty, so the app runs in **demo mode**: a sample hotel
("Hotel Malabar") with 14 dishes, everything saved only in that browser.

1. Open a terminal in this folder and run one of:
   ```
   npx serve .
   ```
   or
   ```
   python -m http.server 8000
   ```
2. Open `http://localhost:8000` (or the address `serve` prints).
3. Open **Kitchen** and **Counter** in other tabs/windows side by side.
   On the start page tap **"Demo: open table 1 as a customer"** (or in Waiter
   mode tap a table → Show QR → "demo: open as customer"). Send an order — it
   appears on the kitchen screen with a beep. Mark it paid at the Counter and
   watch the customer menu close.

> Demo mode works only inside one browser on one device. To use real phones,
> go live (step 2).

---

## 2. Go live (Supabase + Vercel, both free to start)

### a) Database — Supabase
1. Create a project at supabase.com (region: **Mumbai / ap-south-1** is closest to Kerala).
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**.
3. **Authentication → Users → Add user**: the owner's email + password, tick *Auto confirm*.
4. Open `supabase/new-hotel.sql`, change the 4 marked values (slug, names,
   number of tables, owner email) → **Run**. This creates the hotel, links
   the owner login, and adds a starter Kerala menu.
5. **Project Settings → API**: copy the *Project URL* and the *anon / publishable* key.

### b) Settings
Edit `js/config.js`:
```js
SUPABASE_URL: 'https://xxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOi...',
DEFAULT_RESTAURANT: 'hotel-saravana',   // the slug you chose
```
(The anon key is meant to be public — security is done by the database rules in `schema.sql`.)

### c) Hosting — Vercel
Upload this folder as a project (no build step; it is plain HTML/JS).
Either `npx vercel` in this folder, or push to GitHub and import it in Vercel.

### d) At the hotel
1. Owner phone → `admin.html?r=<slug>` → log in → check menu, add photos.
2. Set the number of tables (Owner → Tables). No stickers to print.
3. Kitchen tablet → `kitchen.html?r=<slug>` → log in → tap the screen once
   (turns on the beep). In Chrome use *Add to Home screen* so it opens full-screen.
4. Counter → `counter.html?r=<slug>`, waiter phones → `waiter.html?r=<slug>`
   (log in once; the phone remembers).

Each hotel = one row in the `restaurants` table, so **one Supabase project
serves all your hotels**. For the next hotel, just run `new-hotel.sql` again
with new values.

---

## How the risks from the plan are handled

| Risk | What v1 does |
|---|---|
| Internet drops | Red "No internet — reconnecting…" bar. Realtime reconnects by itself, and every screen also re-checks every 15–20 s and when the screen is switched back on, so missed orders still show up (and still beep). Keep the paper order pad as backup. |
| Orders from home / other shops looking at the menu | No public menu and no fixed QR. The QR is made by the waiter for one table and closes when the bill is paid (or Close table, or 6 h unused). Without a live QR the database returns nothing — not even the item list. |
| Fake prices / pranks | Customers can't write to the database directly. Orders go through `place_order()`, which takes prices and stock from the database. Max 10 untouched orders per table. Counter can cancel any order. |
| Sold-out dish ordered | Open menus refresh every 10 s, so the out-of-stock switch shows quickly; the database also refuses an out-of-stock item. |
| Busy lunch rush | Kitchen sorts New → Preparing → Ready, shows waiting minutes (red after 15 min), repeats the beep while an order is untouched. **Still: test one real lunch before selling.** |
| Money | The app never handles money. The counter just records *Cash* or *UPI*; the hotel's own UPI QR receives payment directly. |

## Folder map
```
index.html  menu.html  waiter.html  kitchen.html  counter.html  admin.html
css/style.css
js/config.js       ← your Supabase URL + key go here
js/common.js       ← Malayalam/English text, beep, offline bar, login
js/store.js        ← database layer (Supabase, or demo = browser storage)
js/menu-ui.js      ← menu + cart, shared by customer and waiter
js/vendor/         ← supabase-js 2.119, qrcode-generator (bundled, no CDN)
supabase/schema.sql     ← run once
supabase/new-hotel.sql  ← run once per hotel
```
To change any Malayalam wording, edit the `ml:` block at the top of `js/common.js`.

## Later (v2 ideas, from the plan)
- Kitchen thermal printer (58/80 mm Bluetooth/USB)
- UPI QR on the bill (`upi_id` is already stored in Settings)
- Parcel / takeaway orders
- WhatsApp bill
- Separate logins for kitchen/waiter vs owner (the `role` column is ready)
