# Digital Menu — v3

QR menu, ordering and billing for small Kerala hotels.
Malayalam + English · works in any phone browser · installable (PWA).

```
Waiter taps table ─► QR on waiter's phone ─► customers scan ─► order
      │                                                         │
      │                 Kitchen screen beeps (big table no.) ◄──┘
      │                 Preparing ─► Ready
      ▼
Waiter "Ready to serve" ─► Served       Counter: bill ─► Paid (Cash/UPI)
                                        ─► QR closes, customer menu closes
```

## Screens

| Page | Who | What |
|---|---|---|
| `index.html?r=<hotel>` | All staff | Staff login. Waiter / kitchen / cashier go straight to their screen. |
| `waiter.html` | Waiter, cashier, manager, owner | Table grid, 📱 Show QR, take orders, close table, "Ready to serve". |
| `kitchen.html` | Kitchen, manager, owner | Big cards, beep, Preparing → Ready, 📦 stock on/off. |
| `counter.html` | Cashier, manager, owner | Bill per table, Paid · Cash / UPI, print bill, cancel order, today's total. |
| `reports.html` | Manager, owner | Sales, bills, avg bill, cash/UPI, sales by day, busy hours, top dishes, by staff, kitchen time, Excel (CSV), print. |
| `admin.html` | Manager, owner | Menu (photos + crop, description, ★ special, reorder, price, stock), **Staff logins**, Look (logo, banner, colour, category photos), Tables, Activity log, Settings. |
| `menu.html?s=<token>` | Customer | Only from the waiter's QR. Closes when the bill is paid. |

## v3 (Phase 5) features

- **Sizes & add-ons** — e.g. Biryani Half / Full, + Extra egg. Customer and waiter choose; kitchen and bill show them.
- **Parcel / takeaway** — 📦 New parcel in Waiter mode (name + phone), optional parcel charge.
- **Payment sheet** at the counter — discount (₹ or %), GST (CGST + SGST, inclusive or extra), round-off,
  Cash / UPI / Split, **UPI QR** with the exact amount, pay only some orders of a table, bill numbers.
- **WhatsApp bill** and **printed bill / KOT** (58 or 80 mm; auto-print KOT on the kitchen device).
- **Move / merge tables.**
- **Stock counts** — set "how many left"; it counts down with every order, shows "Only N left",
  goes out of stock at 0 and comes back if an order is cancelled.

## Roles

| Role | Can do |
|---|---|
| Owner | Everything, incl. adding managers/owners |
| Manager | Everything except managing owners/managers |
| Cashier | Counter + waiter screens, take payment, cancel orders |
| Waiter | Waiter screen: QR, orders, served |
| Kitchen | Kitchen screen, stock on/off |

Staff log in with **username + password** (made in Owner → Staff). A 6-digit
number works as an easy PIN. Owner can rename, reset password, lock/unlock or
remove any login. Locked staff are blocked immediately.

## v2 speed & reliability

- Staff screens apply each live change directly (no full reload per order); full re-sync every 60 s and after reconnect.
- Customer phones poll a tiny "state" call every 8 s; the menu is re-downloaded only when it changed, and cached on the phone.
- **No internet?** Orders are saved on the phone and sent automatically when the net returns. Each order has an ID, so a retry or double tap never creates a second order.
- Order numbers are locked per hotel (no duplicates even with many waiters at once).
- Reports are calculated inside the database (30 days / 4,500 orders ≈ 70 ms).
- Cancel rules, payment rules and roles are enforced in the database, not only in the app.

## Set-up (already done for `demo-hotel`)

1. Supabase → SQL Editor → run `supabase/schema.sql` (safe to re-run; upgrades older versions).
   Already on v2? Running `supabase/upgrade-v3-phase5.sql` is enough.
2. Deploy the Edge Function `supabase/functions/staff-admin` (`supabase functions deploy staff-admin`).
3. `js/config.js`: Supabase URL + publishable key.
4. New hotel: edit and run `supabase/new-hotel.sql`, then create the owner's login in Supabase → Authentication → Add user (same email). It links automatically.
5. Host the folder as a static site (Vercel: import the GitHub repo, framework "Other", no build command).

Leave `SUPABASE_URL` empty in `js/config.js` to run a **demo** that needs no internet (data stays in that browser).

## Files

```
index / waiter / kitchen / counter / admin / reports / menu .html
css/style.css          light + dark theme, hotel colour
js/config.js           Supabase URL + key
js/common.js           Malayalam/English text, login + roles, header, theme
js/store.js            database layer (Supabase, or demo = browser storage)
js/feed.js             live order feed for staff screens
js/outbox.js           offline order queue
js/menu-ui.js          menu + cart + dish photos
js/cropper.js          photo crop / resize
js/charts.js           report charts
js/print.js            bill / KOT printing, UPI QR, WhatsApp
sw.js, manifest.json   install as app
supabase/schema.sql    database (run once / to upgrade)
supabase/functions/staff-admin/index.ts   staff logins
supabase/new-hotel.sql add a hotel
```

## Next (Phase 6 ideas)

Super-admin for many hotels · subscriptions & trials · backups & error alerts · usage dashboard.
