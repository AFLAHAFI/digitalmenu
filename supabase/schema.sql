-- =====================================================================
--  Digital Menu — Supabase schema (v1.2: private menu, waiter-made QR)
--  Run this in Supabase → SQL Editor → New query → Run.
--  Safe to re-run; it also upgrades a database made by an older version.
--
--  How customers get in:
--   * There are NO fixed QR stickers. The menu is not public.
--   * The waiter taps a table on their phone → a QR appears for that
--     table ("table session"). Customers at that table scan it.
--   * With that QR they can order again and again (food, then tea...).
--   * When the counter marks the bill paid, the session closes and the
--     menu on their phones closes too. The old link shows nothing.
--  One Supabase project can serve many hotels.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------------------------------------------------

create table if not exists public.restaurants (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name         text not null,
  name_ml      text,
  tables_count int  not null default 10 check (tables_count between 1 and 200),
  upi_id       text,
  created_at   timestamptz not null default now()
);
alter table public.restaurants drop column if exists confirm_new_phones;   -- from v1.1

-- Which login (Supabase Auth user) can manage which hotel.
create table if not exists public.staff (
  user_id       uuid not null references auth.users(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  role          text not null default 'owner' check (role in ('owner','staff')),
  primary key (user_id, restaurant_id)
);

create table if not exists public.items (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name_en       text not null check (length(name_en) between 1 and 80),
  name_ml       text check (length(name_ml) <= 80),
  category      text not null default 'Main' check (length(category) <= 40),
  price         numeric(8,2) not null check (price >= 0),
  is_veg        boolean not null default true,
  in_stock      boolean not null default true,
  photo_url     text,
  sort          int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists items_restaurant_idx on public.items(restaurant_id);

-- One "table session" = one group of customers at one table, from the
-- moment the waiter shows the QR until the bill is paid.
-- The id is the secret inside the QR (random, impossible to guess).
create table if not exists public.table_sessions (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  table_no         int  not null,
  status           text not null default 'open',
  created_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  closed_at        timestamptz
);
-- upgrade from v1.1 (statuses pending/active)
alter table public.table_sessions alter column status set default 'open';
alter table public.table_sessions drop constraint if exists table_sessions_status_check;
update public.table_sessions set status = 'closed', closed_at = coalesce(closed_at, now()) where status <> 'closed';
alter table public.table_sessions add constraint table_sessions_status_check check (status in ('open','closed'));
alter table public.table_sessions drop column if exists last_order_at;
alter table public.table_sessions add column if not exists last_activity_at timestamptz not null default now();
create index if not exists table_sessions_idx on public.table_sessions(restaurant_id, table_no, status);

create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_no      int  not null,                 -- resets every day: #1, #2, ...
  table_no      int  not null,
  items         jsonb not null,                -- [{id,name_en,name_ml,price,qty,is_veg}]
  total         numeric(10,2) not null,
  note          text,
  source        text not null default 'customer' check (source in ('customer','waiter')),
  status        text not null default 'new',
  session_id    uuid,
  created_at    timestamptz not null default now(),
  ready_at      timestamptz,
  paid_at       timestamptz,
  pay_method    text check (pay_method in ('cash','upi'))
);
alter table public.orders add column if not exists session_id uuid;
update public.orders set status = 'cancelled' where status = 'pending';      -- from v1.1
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('new','preparing','ready','served','cancelled'));
create index if not exists orders_open_idx on public.orders(restaurant_id, created_at desc);
create index if not exists orders_paid_idx on public.orders(restaurant_id, paid_at);
create index if not exists orders_session_idx on public.orders(session_id);

-- ---------- Remove functions from older versions ---------------------
drop function if exists public.place_order(text,int,jsonb,text,text);
drop function if exists public.place_order(text,int,jsonb,text,text,uuid);
drop function if exists public.accept_order(uuid,boolean);
drop function if exists public.get_order_status(uuid[]);

-- ---------- Helper functions -------------------------------------------

create or replace function public.is_staff(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s
                 where s.user_id = auth.uid() and s.restaurant_id = rid);
$$;

-- A session is usable if open and used within the last 6 hours.
create or replace function public.live_session(p_token uuid)
returns public.table_sessions language sql stable security definer set search_path = public as $$
  select * from public.table_sessions
   where id = p_token and status = 'open'
     and last_activity_at > now() - interval '6 hours';
$$;
revoke all on function public.live_session(uuid) from public, anon, authenticated;

-- Shared order-making logic (prices and stock always come from the DB).
create or replace function public.make_order(
  p_rid uuid, p_table int, p_items jsonb, p_note text, p_source text, p_session uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r        public.restaurants%rowtype;
  line     jsonb;
  it       public.items%rowtype;
  q        int;
  out_items jsonb := '[]'::jsonb;
  v_total  numeric(10,2) := 0;
  v_no     int;
  v_id     uuid;
  v_pending int;
  day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
begin
  select * into r from public.restaurants where id = p_rid;
  if not found then raise exception 'Hotel not found'; end if;
  if p_table is null or p_table < 1 or p_table > r.tables_count then
    raise exception 'Invalid table number';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order is empty';
  end if;
  if jsonb_array_length(p_items) > 40 then raise exception 'Too many items in one order'; end if;

  select count(*) into v_pending from public.orders
   where restaurant_id = r.id and table_no = p_table and status = 'new';
  if v_pending >= 10 then raise exception 'Too many pending orders for this table'; end if;

  for line in select * from jsonb_array_elements(p_items) loop
    q := coalesce((line->>'qty')::int, 0);
    if q < 1 or q > 50 then raise exception 'Invalid quantity'; end if;
    select * into it from public.items where id = (line->>'id')::uuid and restaurant_id = r.id;
    if not found then raise exception 'Item not found'; end if;
    if not it.in_stock then raise exception 'OUT_OF_STOCK:%', it.name_en; end if;
    out_items := out_items || jsonb_build_object(
      'id', it.id, 'name_en', it.name_en, 'name_ml', it.name_ml,
      'price', it.price, 'qty', q, 'is_veg', it.is_veg);
    v_total := v_total + it.price * q;
  end loop;

  perform pg_advisory_xact_lock(hashtext(r.id::text));
  select coalesce(max(order_no), 0) + 1 into v_no
    from public.orders where restaurant_id = r.id and created_at >= day_start;

  insert into public.orders(restaurant_id, order_no, table_no, items, total, note, source, session_id)
  values (r.id, v_no, p_table, out_items, v_total,
          nullif(left(trim(coalesce(p_note,'')), 200), ''), p_source, p_session)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'order_no', v_no, 'total', v_total);
end $$;
revoke all on function public.make_order(uuid,int,jsonb,text,text,uuid) from public, anon, authenticated;

-- ---------- Staff functions --------------------------------------------

-- Waiter taps a table: returns that table's open session (or a new one).
-- Everyone at the table scans the same QR.
create or replace function public.open_table(p_rid uuid, p_table int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.table_sessions%rowtype; n int;
begin
  if not public.is_staff(p_rid) then raise exception 'Not allowed'; end if;
  select tables_count into n from public.restaurants where id = p_rid;
  if p_table < 1 or p_table > n then raise exception 'Invalid table number'; end if;
  -- close a forgotten session (no activity for 6 h)
  update public.table_sessions set status = 'closed', closed_at = now()
   where restaurant_id = p_rid and table_no = p_table and status = 'open'
     and last_activity_at <= now() - interval '6 hours';
  select * into s from public.table_sessions
   where restaurant_id = p_rid and table_no = p_table and status = 'open'
   order by created_at desc limit 1;
  if not found then
    insert into public.table_sessions(restaurant_id, table_no) values (p_rid, p_table) returning * into s;
  else
    update public.table_sessions set last_activity_at = now() where id = s.id;
  end if;
  return jsonb_build_object('token', s.id, 'table_no', s.table_no, 'created_at', s.created_at);
end $$;

-- Waiter: "customers left" / "make a new QR". The old QR stops working.
create or replace function public.close_table(p_rid uuid, p_table int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff(p_rid) then raise exception 'Not allowed'; end if;
  update public.table_sessions set status = 'closed', closed_at = now()
   where restaurant_id = p_rid and table_no = p_table and status = 'open';
end $$;

-- Waiter takes an order on their own phone (no QR needed).
create or replace function public.place_waiter_order(p_rid uuid, p_table int, p_items jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  if not public.is_staff(p_rid) then raise exception 'Not allowed'; end if;
  select id into s from public.table_sessions
   where restaurant_id = p_rid and table_no = p_table and status = 'open' limit 1;
  return public.make_order(p_rid, p_table, p_items, p_note, 'waiter', s);
end $$;

-- Counter marks a table paid. This closes the table session, so the
-- menu on the customers' phones closes too.
create or replace function public.mark_table_paid(p_rid uuid, p_table int, p_method text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_staff(p_rid) then raise exception 'Not allowed'; end if;
  if p_method not in ('cash','upi') then raise exception 'Invalid payment method'; end if;
  update public.orders set paid_at = now(), pay_method = p_method
   where restaurant_id = p_rid and table_no = p_table and paid_at is null and status <> 'cancelled';
  get diagnostics n = row_count;
  update public.table_sessions set status = 'closed', closed_at = now()
   where restaurant_id = p_rid and table_no = p_table and status = 'open';
  return n;
end $$;

-- ---------- Customer functions (need the QR token) ----------------------

-- The menu itself. Without a live token nothing is returned.
create or replace function public.session_menu(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.table_sessions%rowtype; r public.restaurants%rowtype;
begin
  select * into s from public.live_session(p_token);
  if s.id is null then raise exception 'SESSION_CLOSED'; end if;
  select * into r from public.restaurants where id = s.restaurant_id;
  return jsonb_build_object(
    'restaurant', jsonb_build_object('name', r.name, 'name_ml', r.name_ml, 'slug', r.slug),
    'table_no', s.table_no,
    'items', coalesce((select jsonb_agg(to_jsonb(i) - 'restaurant_id' - 'created_at'
                                        order by i.category, i.sort, i.name_en)
                         from public.items i where i.restaurant_id = s.restaurant_id), '[]'::jsonb));
end $$;

create or replace function public.place_order(p_token uuid, p_items jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.table_sessions%rowtype;
begin
  select * into s from public.live_session(p_token);
  if s.id is null then raise exception 'SESSION_CLOSED'; end if;
  update public.table_sessions set last_activity_at = now() where id = s.id;
  return public.make_order(s.restaurant_id, s.table_no, p_items, p_note, 'customer', s.id);
end $$;

-- Orders of this table session, with live status, for the customer's phone.
create or replace function public.session_orders(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.table_sessions%rowtype;
begin
  select * into s from public.live_session(p_token);
  if s.id is null then raise exception 'SESSION_CLOSED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'order_no', o.order_no, 'status', o.status,
                                      'total', o.total, 'created_at', o.created_at) order by o.created_at desc)
                     from public.orders o where o.session_id = s.id), '[]'::jsonb);
end $$;

revoke all on function public.open_table(uuid,int) from public, anon;
revoke all on function public.close_table(uuid,int) from public, anon;
revoke all on function public.place_waiter_order(uuid,int,jsonb,text) from public, anon;
revoke all on function public.mark_table_paid(uuid,int,text) from public, anon;
revoke all on function public.is_staff(uuid) from public, anon;
grant execute on function public.session_menu(uuid) to anon, authenticated;
grant execute on function public.place_order(uuid,jsonb,text) to anon, authenticated;
grant execute on function public.session_orders(uuid) to anon, authenticated;
grant execute on function public.open_table(uuid,int) to authenticated;
grant execute on function public.close_table(uuid,int) to authenticated;
grant execute on function public.place_waiter_order(uuid,int,jsonb,text) to authenticated;
grant execute on function public.mark_table_paid(uuid,int,text) to authenticated;
grant execute on function public.is_staff(uuid) to authenticated;

-- ---------- Row Level Security ------------------------------------------

alter table public.restaurants    enable row level security;
alter table public.staff          enable row level security;
alter table public.items          enable row level security;
alter table public.orders         enable row level security;
alter table public.table_sessions enable row level security;

-- hotel name is needed on the staff login screen; nothing secret in it
drop policy if exists "restaurants readable by all" on public.restaurants;
create policy "restaurants readable by all" on public.restaurants
  for select using (true);
drop policy if exists "staff update restaurant" on public.restaurants;
create policy "staff update restaurant" on public.restaurants
  for update to authenticated using (public.is_staff(id)) with check (public.is_staff(id));

drop policy if exists "see own staff rows" on public.staff;
create policy "see own staff rows" on public.staff
  for select to authenticated using (user_id = auth.uid());

-- MENU IS PRIVATE: only staff read items directly. Customers get the
-- menu only through session_menu() with a live QR token.
drop policy if exists "menu readable by all" on public.items;
drop policy if exists "staff read items" on public.items;
create policy "staff read items" on public.items
  for select to authenticated using (public.is_staff(restaurant_id));
drop policy if exists "staff insert items" on public.items;
create policy "staff insert items" on public.items
  for insert to authenticated with check (public.is_staff(restaurant_id));
drop policy if exists "staff update items" on public.items;
create policy "staff update items" on public.items
  for update to authenticated using (public.is_staff(restaurant_id)) with check (public.is_staff(restaurant_id));
drop policy if exists "staff delete items" on public.items;
create policy "staff delete items" on public.items
  for delete to authenticated using (public.is_staff(restaurant_id));

drop policy if exists "staff read orders" on public.orders;
create policy "staff read orders" on public.orders
  for select to authenticated using (public.is_staff(restaurant_id));
drop policy if exists "staff update orders" on public.orders;
create policy "staff update orders" on public.orders
  for update to authenticated using (public.is_staff(restaurant_id)) with check (public.is_staff(restaurant_id));

drop policy if exists "staff read sessions" on public.table_sessions;
create policy "staff read sessions" on public.table_sessions
  for select to authenticated using (public.is_staff(restaurant_id));

-- ---------- Realtime (staff screens) -----------------------------------
do $$ begin
  begin alter publication supabase_realtime add table public.orders; exception when others then null; end;
  begin alter publication supabase_realtime add table public.items;  exception when others then null; end;
  begin alter publication supabase_realtime add table public.table_sessions; exception when others then null; end;
end $$;

-- ---------- Photo storage ------------------------------------------------
insert into storage.buckets (id, name, public)
values ('menu-photos', 'menu-photos', true)
on conflict (id) do nothing;

-- public bucket: photos load by their (random) URL; no read policy, so
-- nobody can list the bucket to browse every hotel's photos
drop policy if exists "menu photos public read" on storage.objects;
drop policy if exists "staff upload menu photos" on storage.objects;
create policy "staff upload menu photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu-photos'
              and public.is_staff(((storage.foldername(name))[1])::uuid));
drop policy if exists "staff delete menu photos" on storage.objects;
create policy "staff delete menu photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu-photos'
         and public.is_staff(((storage.foldername(name))[1])::uuid));

-- ---------- Staff invites ----------------------------------------------
-- Add an email here; when that person's login is created (Supabase →
-- Authentication → Add user), they become staff of that hotel automatically.
create table if not exists public.staff_invites (
  email         text not null,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  role          text not null default 'owner' check (role in ('owner','staff')),
  primary key (email, restaurant_id)
);
alter table public.staff_invites enable row level security;  -- no policies: not readable by clients

create or replace function public.accept_staff_invites()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.staff(user_id, restaurant_id, role)
  select new.id, i.restaurant_id, i.role from public.staff_invites i
   where lower(i.email) = lower(new.email)
  on conflict do nothing;
  return new;
end $$;
revoke all on function public.accept_staff_invites() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_staff on auth.users;
create trigger on_auth_user_created_staff
  after insert on auth.users
  for each row execute function public.accept_staff_invites();
