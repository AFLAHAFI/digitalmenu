-- =====================================================================
--  Digital Menu — Supabase schema  v2
--  Run in Supabase → SQL Editor → New query → Run.
--  Safe to re-run. Upgrades any older version and keeps all data.
--
--  * Menu is private: customers only reach it through the QR the waiter
--    opens for a table ("table session"). Paying the bill closes it.
--  * Staff roles: owner, manager, waiter, kitchen, cashier.
--  * Staff logins (username + password) are created by the
--    "staff-admin" Edge Function (needs the service key, so it can't be
--    done from the browser).
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
--  TABLES
-- =====================================================================

create table if not exists public.restaurants (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name         text not null,
  name_ml      text,
  tables_count int  not null default 10 check (tables_count between 1 and 200),
  upi_id       text,
  created_at   timestamptz not null default now()
);
alter table public.restaurants drop column if exists confirm_new_phones;
alter table public.restaurants add column if not exists logo_url text;
alter table public.restaurants add column if not exists banner_url text;
alter table public.restaurants add column if not exists theme_color text not null default '#1f7a4d';
alter table public.restaurants add column if not exists category_photos jsonb not null default '{}'::jsonb;
alter table public.restaurants add column if not exists menu_version int not null default 1;
alter table public.restaurants drop constraint if exists restaurants_theme_color_check;
alter table public.restaurants add constraint restaurants_theme_color_check check (theme_color ~ '^#[0-9a-fA-F]{6}$');

create table if not exists public.staff (
  user_id       uuid not null references auth.users(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  role          text not null default 'owner',
  primary key (user_id, restaurant_id)
);
alter table public.staff add column if not exists display_name text;
alter table public.staff add column if not exists username text;
alter table public.staff add column if not exists active boolean not null default true;
alter table public.staff add column if not exists created_at timestamptz not null default now();
alter table public.staff drop constraint if exists staff_role_check;
update public.staff set role = 'waiter' where role not in ('owner','manager','waiter','kitchen','cashier');
alter table public.staff add constraint staff_role_check check (role in ('owner','manager','waiter','kitchen','cashier'));
create unique index if not exists staff_username_uq on public.staff(restaurant_id, lower(username)) where username is not null;
create index if not exists staff_user_idx on public.staff(user_id);

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
alter table public.items add column if not exists description text;
alter table public.items add column if not exists photos jsonb not null default '[]'::jsonb;   -- extra photos
alter table public.items add column if not exists is_special boolean not null default false;
alter table public.items add column if not exists updated_at timestamptz not null default now();
alter table public.items drop constraint if exists items_description_check;
alter table public.items add constraint items_description_check check (length(description) <= 300);
create index if not exists items_restaurant_idx on public.items(restaurant_id);

create table if not exists public.table_sessions (
  id               uuid primary key default gen_random_uuid(),   -- the secret inside the QR
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  table_no         int  not null,
  status           text not null default 'open',
  created_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  closed_at        timestamptz
);
alter table public.table_sessions add column if not exists last_activity_at timestamptz not null default now();
alter table public.table_sessions drop column if exists last_order_at;
alter table public.table_sessions alter column status set default 'open';
alter table public.table_sessions drop constraint if exists table_sessions_status_check;
update public.table_sessions set status = 'closed', closed_at = coalesce(closed_at, now()) where status not in ('open','closed');
alter table public.table_sessions add constraint table_sessions_status_check check (status in ('open','closed'));
create index if not exists table_sessions_idx on public.table_sessions(restaurant_id, table_no, status);

create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_no      int  not null,
  table_no      int  not null,
  items         jsonb not null,
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
alter table public.orders add column if not exists created_by uuid;        -- staff who took it (null = customer QR)
alter table public.orders add column if not exists client_ref uuid;        -- de-duplicates retries / double taps
alter table public.orders add column if not exists preparing_at timestamptz;
alter table public.orders add column if not exists served_at timestamptz;
alter table public.orders add column if not exists cancelled_at timestamptz;
alter table public.orders add column if not exists cancelled_by uuid;
update public.orders set status = 'cancelled' where status not in ('new','preparing','ready','served','cancelled');
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('new','preparing','ready','served','cancelled'));
create index if not exists orders_open_idx on public.orders(restaurant_id, created_at desc);
create index if not exists orders_paid_idx on public.orders(restaurant_id, paid_at);
create index if not exists orders_session_idx on public.orders(session_id);
create index if not exists orders_unpaid_idx on public.orders(restaurant_id, table_no) where paid_at is null and status <> 'cancelled';
create unique index if not exists orders_client_ref_uq on public.orders(restaurant_id, client_ref) where client_ref is not null;

create table if not exists public.staff_invites (
  email         text not null,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  role          text not null default 'owner',
  primary key (email, restaurant_id)
);
alter table public.staff_invites drop constraint if exists staff_invites_role_check;
alter table public.staff_invites add constraint staff_invites_role_check check (role in ('owner','manager','waiter','kitchen','cashier'));

create table if not exists public.audit_log (
  id            bigserial primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id       uuid,
  actor         text,
  action        text not null,
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists audit_log_idx on public.audit_log(restaurant_id, created_at desc);

-- =====================================================================
--  OLD FUNCTIONS (replaced below with new signatures)
-- =====================================================================
drop function if exists public.place_order(text,int,jsonb,text,text);
drop function if exists public.place_order(text,int,jsonb,text,text,uuid);
drop function if exists public.place_order(uuid,jsonb,text);
drop function if exists public.place_waiter_order(uuid,int,jsonb,text);
drop function if exists public.make_order(uuid,int,jsonb,text,text,uuid);
drop function if exists public.accept_order(uuid,boolean);
drop function if exists public.get_order_status(uuid[]);
drop function if exists public.session_orders(uuid);

-- =====================================================================
--  ROLE HELPERS
-- =====================================================================
create or replace function public.has_role(rid uuid, roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s
                 where s.user_id = auth.uid() and s.restaurant_id = rid
                   and s.active and s.role = any(roles));
$$;

create or replace function public.is_staff(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(rid, array['owner','manager','waiter','kitchen','cashier']);
$$;

-- Who am I in this hotel? -> {role, display_name, username} or null
create or replace function public.my_role(p_rid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('role', s.role, 'display_name', s.display_name, 'username', s.username)
    from public.staff s
   where s.user_id = auth.uid() and s.restaurant_id = p_rid and s.active;
$$;

create or replace function public.actor_name(p_rid uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select coalesce(s.display_name, s.username) from public.staff s
      where s.user_id = auth.uid() and s.restaurant_id = p_rid),
    (select u.email from auth.users u where u.id = auth.uid()),
    'system');
$$;

create or replace function public.log_audit(p_rid uuid, p_action text, p_details jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log(restaurant_id, user_id, actor, action, details)
  values (p_rid, auth.uid(), public.actor_name(p_rid), p_action, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function public.live_session(p_token uuid)
returns public.table_sessions language sql stable security definer set search_path = public as $$
  select * from public.table_sessions
   where id = p_token and status = 'open'
     and last_activity_at > now() - interval '6 hours';
$$;

-- =====================================================================
--  ORDERS
-- =====================================================================
create or replace function public.make_order(
  p_rid uuid, p_table int, p_items jsonb, p_note text, p_source text,
  p_session uuid, p_client_ref uuid, p_created_by uuid
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
  v_prev   jsonb;
  v_pending int;
  day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
begin
  select * into r from public.restaurants where id = p_rid;
  if not found then raise exception 'Hotel not found'; end if;

  -- one order at a time per hotel: keeps order numbers in sequence
  perform pg_advisory_xact_lock(hashtext(r.id::text));

  -- same order sent twice (retry after network drop, double tap): return the first one
  if p_client_ref is not null then
    select jsonb_build_object('id', o.id, 'order_no', o.order_no, 'total', o.total, 'duplicate', true)
      into v_prev from public.orders o where o.restaurant_id = r.id and o.client_ref = p_client_ref;
    if v_prev is not null then return v_prev; end if;
  end if;

  if p_table is null or p_table < 1 or p_table > r.tables_count then
    raise exception 'Invalid table number';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order is empty';
  end if;
  if jsonb_array_length(p_items) > 40 then raise exception 'Too many items in one order'; end if;

  select count(*) into v_pending from public.orders
   where restaurant_id = r.id and table_no = p_table and status = 'new';
  if v_pending >= 15 then raise exception 'Too many pending orders for this table'; end if;

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

  select coalesce(max(order_no), 0) + 1 into v_no
    from public.orders where restaurant_id = r.id and created_at >= day_start;

  insert into public.orders(restaurant_id, order_no, table_no, items, total, note, source,
                            session_id, client_ref, created_by)
  values (r.id, v_no, p_table, out_items, v_total,
          nullif(left(trim(coalesce(p_note,'')), 200), ''), p_source,
          p_session, p_client_ref, p_created_by)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'order_no', v_no, 'total', v_total);
end $$;

-- customer, with the QR token
create or replace function public.place_order(p_token uuid, p_items jsonb, p_note text default null, p_client_ref uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.table_sessions%rowtype;
begin
  select * into s from public.live_session(p_token);
  if s.id is null then raise exception 'SESSION_CLOSED'; end if;
  update public.table_sessions set last_activity_at = now() where id = s.id;
  return public.make_order(s.restaurant_id, s.table_no, p_items, p_note, 'customer', s.id, p_client_ref, null);
end $$;

-- waiter / cashier / manager on their own phone
create or replace function public.place_waiter_order(p_rid uuid, p_table int, p_items jsonb, p_note text default null, p_client_ref uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  if not public.has_role(p_rid, array['owner','manager','waiter','cashier']) then raise exception 'Not allowed'; end if;
  select id into s from public.table_sessions
   where restaurant_id = p_rid and table_no = p_table and status = 'open' limit 1;
  return public.make_order(p_rid, p_table, p_items, p_note, 'waiter', s, p_client_ref, auth.uid());
end $$;

-- status time stamps + who may cancel (runs for every status change)
create or replace function public.orders_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if auth.uid() is not null and new.status = 'cancelled' then
      if not public.has_role(new.restaurant_id, array['owner','manager','cashier']) then
        raise exception 'Only owner, manager or cashier can cancel orders';
      end if;
      if old.paid_at is not null then raise exception 'Order is already paid'; end if;
    end if;
    if old.status = 'cancelled' and auth.uid() is not null then raise exception 'Order is cancelled'; end if;
    if new.status = 'preparing' then new.preparing_at := coalesce(new.preparing_at, now()); end if;
    if new.status = 'ready'     then new.ready_at     := coalesce(old.ready_at, now()); end if;
    if new.status = 'served'    then new.served_at    := coalesce(old.served_at, now());
                                     new.ready_at     := coalesce(new.ready_at, now()); end if;
    if new.status = 'cancelled' then new.cancelled_at := now(); new.cancelled_by := auth.uid(); end if;
  end if;
  return new;
end $$;
drop trigger if exists orders_before_update on public.orders;
create trigger orders_before_update before update on public.orders
  for each row execute function public.orders_before_update();

create or replace function public.orders_after_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    perform public.log_audit(new.restaurant_id, 'order_cancelled',
      jsonb_build_object('order_no', new.order_no, 'table', new.table_no, 'total', new.total));
  end if;
  return null;
end $$;
drop trigger if exists orders_after_update on public.orders;
create trigger orders_after_update after update on public.orders
  for each row execute function public.orders_after_update();

-- =====================================================================
--  TABLES (QR sessions) & PAYMENT
-- =====================================================================
create or replace function public.open_table(p_rid uuid, p_table int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.table_sessions%rowtype; n int;
begin
  if not public.has_role(p_rid, array['owner','manager','waiter','cashier']) then raise exception 'Not allowed'; end if;
  select tables_count into n from public.restaurants where id = p_rid;
  if p_table < 1 or p_table > n then raise exception 'Invalid table number'; end if;
  perform pg_advisory_xact_lock(hashtext(p_rid::text || ':' || p_table));
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

create or replace function public.close_table(p_rid uuid, p_table int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(p_rid, array['owner','manager','waiter','cashier']) then raise exception 'Not allowed'; end if;
  update public.table_sessions set status = 'closed', closed_at = now()
   where restaurant_id = p_rid and table_no = p_table and status = 'open';
end $$;

create or replace function public.mark_table_paid(p_rid uuid, p_table int, p_method text)
returns int language plpgsql security definer set search_path = public as $$
declare n int; amt numeric;
begin
  if not public.has_role(p_rid, array['owner','manager','cashier']) then raise exception 'Not allowed'; end if;
  if p_method not in ('cash','upi') then raise exception 'Invalid payment method'; end if;
  with u as (
    update public.orders set paid_at = now(), pay_method = p_method
     where restaurant_id = p_rid and table_no = p_table and paid_at is null and status <> 'cancelled'
    returning total)
  select count(*), coalesce(sum(total),0) into n, amt from u;
  update public.table_sessions set status = 'closed', closed_at = now()
   where restaurant_id = p_rid and table_no = p_table and status = 'open';
  if n > 0 then
    perform public.log_audit(p_rid, 'bill_paid', jsonb_build_object('table', p_table, 'amount', amt, 'method', p_method, 'orders', n));
  end if;
  return n;
end $$;

-- =====================================================================
--  CUSTOMER (needs the QR token)
-- =====================================================================
create or replace function public.session_menu(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.table_sessions%rowtype; r public.restaurants%rowtype;
begin
  select * into s from public.live_session(p_token);
  if s.id is null then raise exception 'SESSION_CLOSED'; end if;
  select * into r from public.restaurants where id = s.restaurant_id;
  return jsonb_build_object(
    'restaurant', jsonb_build_object('name', r.name, 'name_ml', r.name_ml, 'slug', r.slug,
                                     'logo_url', r.logo_url, 'banner_url', r.banner_url,
                                     'theme_color', r.theme_color, 'category_photos', r.category_photos),
    'menu_version', r.menu_version,
    'table_no', s.table_no,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', i.id, 'name_en', i.name_en, 'name_ml', i.name_ml, 'category', i.category,
                 'price', i.price, 'is_veg', i.is_veg, 'in_stock', i.in_stock, 'photo_url', i.photo_url,
                 'photos', i.photos, 'description', i.description, 'is_special', i.is_special, 'sort', i.sort)
               order by i.category, i.sort, i.name_en)
               from public.items i where i.restaurant_id = s.restaurant_id), '[]'::jsonb));
end $$;

-- Cheap poll: is the table still open, did the menu change, order statuses.
create or replace function public.session_state(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.table_sessions%rowtype; v int;
begin
  select * into s from public.live_session(p_token);
  if s.id is null then return jsonb_build_object('open', false); end if;
  select menu_version into v from public.restaurants where id = s.restaurant_id;
  return jsonb_build_object('open', true, 'menu_version', v, 'table_no', s.table_no,
    'orders', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'order_no', o.order_no, 'status', o.status,
                          'total', o.total, 'created_at', o.created_at) order by o.created_at desc)
                        from public.orders o where o.session_id = s.id), '[]'::jsonb));
end $$;

-- =====================================================================
--  MENU HELPERS
-- =====================================================================
create or replace function public.set_stock(p_item uuid, p_in_stock boolean)
returns void language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  select restaurant_id into rid from public.items where id = p_item;
  if rid is null or not public.has_role(rid, array['owner','manager','kitchen']) then raise exception 'Not allowed'; end if;
  update public.items set in_stock = p_in_stock where id = p_item;
end $$;

create or replace function public.reorder_items(p_rid uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(p_rid, array['owner','manager']) then raise exception 'Not allowed'; end if;
  update public.items i set sort = x.ord
    from unnest(p_ids) with ordinality as x(id, ord)
   where i.id = x.id and i.restaurant_id = p_rid and i.sort is distinct from x.ord;
end $$;

create or replace function public.items_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.price is distinct from old.price then
      perform public.log_audit(new.restaurant_id, 'price_changed',
        jsonb_build_object('item', new.name_en, 'from', old.price, 'to', new.price));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items
  for each row execute function public.items_touch();

-- any menu change -> bump menu_version so customer phones reload the menu
create or replace function public.items_bump_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.restaurants set menu_version = menu_version + 1
   where id = coalesce(new.restaurant_id, old.restaurant_id);
  if tg_op = 'INSERT' then
    perform public.log_audit(new.restaurant_id, 'item_added', jsonb_build_object('item', new.name_en, 'price', new.price));
  elsif tg_op = 'DELETE' then
    perform public.log_audit(old.restaurant_id, 'item_deleted', jsonb_build_object('item', old.name_en));
  end if;
  return null;
end $$;
drop trigger if exists items_bump_version on public.items;
create trigger items_bump_version after insert or update or delete on public.items
  for each row execute function public.items_bump_version();

create or replace function public.restaurants_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.name, new.name_ml, new.logo_url, new.banner_url, new.theme_color, new.category_photos)
     is distinct from
     (old.name, old.name_ml, old.logo_url, old.banner_url, old.theme_color, old.category_photos) then
    new.menu_version := old.menu_version + 1;
  end if;
  return new;
end $$;
drop trigger if exists restaurants_touch on public.restaurants;
create trigger restaurants_touch before update on public.restaurants
  for each row execute function public.restaurants_touch();

-- =====================================================================
--  STAFF (logins are created by the staff-admin Edge Function)
-- =====================================================================
create or replace function public.list_staff(p_rid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(p_rid, array['owner','manager']) then raise exception 'Not allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
            'user_id', s.user_id, 'username', s.username, 'display_name', s.display_name,
            'role', s.role, 'active', s.active, 'created_at', s.created_at,
            'email', case when s.username is null then u.email end,
            'is_me', s.user_id = auth.uid())
          order by array_position(array['owner','manager','cashier','waiter','kitchen'], s.role), lower(coalesce(s.display_name, s.username, u.email)))
          from public.staff s join auth.users u on u.id = s.user_id
         where s.restaurant_id = p_rid), '[]'::jsonb);
end $$;

create or replace function public.accept_staff_invites()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.staff(user_id, restaurant_id, role, display_name)
  select new.id, i.restaurant_id, i.role, split_part(new.email, '@', 1) from public.staff_invites i
   where lower(i.email) = lower(new.email)
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created_staff on auth.users;
create trigger on_auth_user_created_staff
  after insert on auth.users
  for each row execute function public.accept_staff_invites();

-- =====================================================================
--  REPORTS (computed in the database = fast even with many orders)
-- =====================================================================
create or replace function public.report(p_rid uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  if not public.has_role(p_rid, array['owner','manager']) then raise exception 'Not allowed'; end if;
  if p_to <= p_from or p_to - p_from > interval '400 days' then raise exception 'Invalid date range'; end if;

  with o as (
    select * from public.orders where restaurant_id = p_rid and created_at >= p_from and created_at < p_to
  ), ok as (select * from o where status <> 'cancelled'),
  li as (
    select (x->>'id') as id, max(x->>'name_en') as name_en, max(x->>'name_ml') as name_ml,
           sum((x->>'qty')::int) as qty, sum((x->>'qty')::int * (x->>'price')::numeric) as amount
      from ok, jsonb_array_elements(ok.items) x group by 1
  )
  select jsonb_build_object(
    'sales',        coalesce((select sum(total) from ok), 0),
    'paid',         coalesce((select sum(total) from ok where paid_at is not null), 0),
    'unpaid',       coalesce((select sum(total) from ok where paid_at is null), 0),
    'cash',         coalesce((select sum(total) from ok where pay_method = 'cash'), 0),
    'upi',          coalesce((select sum(total) from ok where pay_method = 'upi'), 0),
    'orders',       (select count(*) from ok),
    'bills',        (select count(distinct (table_no, paid_at)) from ok where paid_at is not null),
    'items_sold',   coalesce((select sum(qty) from li), 0),
    'cancelled',    (select count(*) from o where status = 'cancelled'),
    'cancelled_value', coalesce((select sum(total) from o where status = 'cancelled'), 0),
    'avg_prep_min', (select round(avg(extract(epoch from (ready_at - created_at)) / 60)::numeric, 1)
                       from ok where ready_at is not null and ready_at > created_at),
    'by_source',    jsonb_build_object('customer', (select count(*) from ok where source = 'customer'),
                                       'waiter',   (select count(*) from ok where source = 'waiter')),
    'by_day', coalesce((select jsonb_agg(d order by d->>'day') from (
        select jsonb_build_object('day', to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
                                  'sales', sum(total), 'orders', count(*)) d
          from ok group by to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD')) q), '[]'::jsonb),
    'by_hour', coalesce((select jsonb_agg(h order by (h->>'hour')::int) from (
        select jsonb_build_object('hour', extract(hour from created_at at time zone 'Asia/Kolkata')::int,
                                  'sales', sum(total), 'orders', count(*)) h
          from ok group by extract(hour from created_at at time zone 'Asia/Kolkata')::int) q), '[]'::jsonb),
    'top_items', coalesce((select jsonb_agg(t) from (
        select jsonb_build_object('name_en', name_en, 'name_ml', name_ml, 'qty', qty, 'amount', amount) t
          from li order by qty desc, amount desc limit 15) q), '[]'::jsonb),
    'by_waiter', coalesce((select jsonb_agg(w) from (
        select jsonb_build_object('name', coalesce(s.display_name, s.username, case when ok.created_by is null then null else 'staff' end),
                                  'is_customer', ok.created_by is null,
                                  'orders', count(*), 'sales', sum(ok.total)) w
          from ok left join public.staff s on s.user_id = ok.created_by and s.restaurant_id = p_rid
         group by ok.created_by, s.display_name, s.username order by sum(ok.total) desc) q), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- Order list for Excel/CSV download
create or replace function public.report_orders(p_rid uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(p_rid, array['owner','manager']) then raise exception 'Not allowed'; end if;
  if p_to <= p_from or p_to - p_from > interval '400 days' then raise exception 'Invalid date range'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'order_no', o.order_no, 'created_at', o.created_at, 'table_no', o.table_no, 'status', o.status,
      'source', o.source, 'staff', coalesce(s.display_name, s.username),
      'items', (select string_agg((x->>'qty') || ' x ' || (x->>'name_en'), ', ') from jsonb_array_elements(o.items) x),
      'total', o.total, 'pay_method', o.pay_method, 'paid_at', o.paid_at) order by o.created_at)
    from (select * from public.orders where restaurant_id = p_rid and created_at >= p_from and created_at < p_to
          order by created_at limit 20000) o
    left join public.staff s on s.user_id = o.created_by and s.restaurant_id = p_rid), '[]'::jsonb);
end $$;

-- =====================================================================
--  PERMISSIONS
-- =====================================================================
revoke all on function public.live_session(uuid) from public, anon, authenticated;
revoke all on function public.make_order(uuid,int,jsonb,text,text,uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.log_audit(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.actor_name(uuid) from public, anon, authenticated;
revoke all on function public.accept_staff_invites() from public, anon, authenticated;
revoke all on function public.orders_before_update() from public, anon, authenticated;
revoke all on function public.orders_after_update() from public, anon, authenticated;
revoke all on function public.items_touch() from public, anon, authenticated;
revoke all on function public.items_bump_version() from public, anon, authenticated;
revoke all on function public.restaurants_touch() from public, anon, authenticated;

revoke all on function public.has_role(uuid,text[]) from public, anon;
revoke all on function public.is_staff(uuid) from public, anon;
revoke all on function public.my_role(uuid) from public, anon;
revoke all on function public.open_table(uuid,int) from public, anon;
revoke all on function public.close_table(uuid,int) from public, anon;
revoke all on function public.place_waiter_order(uuid,int,jsonb,text,uuid) from public, anon;
revoke all on function public.mark_table_paid(uuid,int,text) from public, anon;
revoke all on function public.set_stock(uuid,boolean) from public, anon;
revoke all on function public.reorder_items(uuid,uuid[]) from public, anon;
revoke all on function public.list_staff(uuid) from public, anon;
revoke all on function public.report(uuid,timestamptz,timestamptz) from public, anon;
revoke all on function public.report_orders(uuid,timestamptz,timestamptz) from public, anon;

grant execute on function public.session_menu(uuid) to anon, authenticated;
grant execute on function public.session_state(uuid) to anon, authenticated;
grant execute on function public.place_order(uuid,jsonb,text,uuid) to anon, authenticated;
grant execute on function public.has_role(uuid,text[]) to authenticated;
grant execute on function public.is_staff(uuid) to authenticated;
grant execute on function public.my_role(uuid) to authenticated;
grant execute on function public.open_table(uuid,int) to authenticated;
grant execute on function public.close_table(uuid,int) to authenticated;
grant execute on function public.place_waiter_order(uuid,int,jsonb,text,uuid) to authenticated;
grant execute on function public.mark_table_paid(uuid,int,text) to authenticated;
grant execute on function public.set_stock(uuid,boolean) to authenticated;
grant execute on function public.reorder_items(uuid,uuid[]) to authenticated;
grant execute on function public.list_staff(uuid) to authenticated;
grant execute on function public.report(uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.report_orders(uuid,timestamptz,timestamptz) to authenticated;

-- column-level: staff may only change these columns directly
revoke insert, update, delete on public.restaurants from anon, authenticated;
grant update (name, name_ml, tables_count, upi_id, logo_url, banner_url, theme_color, category_photos)
  on public.restaurants to authenticated;
revoke insert, update, delete on public.orders from anon, authenticated;
grant update (status) on public.orders to authenticated;
revoke insert, update, delete on public.staff from anon, authenticated;
revoke all on public.staff_invites from anon, authenticated;
revoke insert, update, delete on public.audit_log from anon, authenticated;
revoke insert, update, delete on public.table_sessions from anon, authenticated;
revoke insert, update, delete on public.items from anon;

-- =====================================================================
--  ROW LEVEL SECURITY
-- =====================================================================
alter table public.restaurants    enable row level security;
alter table public.staff          enable row level security;
alter table public.items          enable row level security;
alter table public.orders         enable row level security;
alter table public.table_sessions enable row level security;
alter table public.staff_invites  enable row level security;
alter table public.audit_log      enable row level security;

drop policy if exists "restaurants readable by all" on public.restaurants;
create policy "restaurants readable by all" on public.restaurants for select using (true);
drop policy if exists "staff update restaurant" on public.restaurants;
drop policy if exists "managers update restaurant" on public.restaurants;
create policy "managers update restaurant" on public.restaurants
  for update to authenticated using (public.has_role(id, array['owner','manager']))
  with check (public.has_role(id, array['owner','manager']));

drop policy if exists "see own staff rows" on public.staff;
create policy "see own staff rows" on public.staff for select to authenticated using (user_id = auth.uid());

drop policy if exists "menu readable by all" on public.items;
drop policy if exists "staff read items" on public.items;
create policy "staff read items" on public.items for select to authenticated using (public.is_staff(restaurant_id));
drop policy if exists "staff insert items" on public.items;
create policy "staff insert items" on public.items for insert to authenticated
  with check (public.has_role(restaurant_id, array['owner','manager']));
drop policy if exists "staff update items" on public.items;
create policy "staff update items" on public.items for update to authenticated
  using (public.has_role(restaurant_id, array['owner','manager']))
  with check (public.has_role(restaurant_id, array['owner','manager']));
drop policy if exists "staff delete items" on public.items;
create policy "staff delete items" on public.items for delete to authenticated
  using (public.has_role(restaurant_id, array['owner','manager']));

drop policy if exists "staff read orders" on public.orders;
create policy "staff read orders" on public.orders for select to authenticated using (public.is_staff(restaurant_id));
drop policy if exists "staff update orders" on public.orders;
create policy "staff update orders" on public.orders for update to authenticated
  using (public.is_staff(restaurant_id)) with check (public.is_staff(restaurant_id));

drop policy if exists "staff read sessions" on public.table_sessions;
create policy "staff read sessions" on public.table_sessions for select to authenticated using (public.is_staff(restaurant_id));

drop policy if exists "managers read audit" on public.audit_log;
create policy "managers read audit" on public.audit_log for select to authenticated
  using (public.has_role(restaurant_id, array['owner','manager']));

-- =====================================================================
--  REALTIME (staff screens get changes instantly)
-- =====================================================================
alter table public.orders replica identity full;   -- old row in UPDATE events (needed for filters)
do $$ begin
  begin alter publication supabase_realtime add table public.orders; exception when others then null; end;
  begin alter publication supabase_realtime add table public.items;  exception when others then null; end;
  begin alter publication supabase_realtime add table public.table_sessions; exception when others then null; end;
end $$;

-- =====================================================================
--  PHOTO STORAGE (public bucket: photos load by their random URL;
--  no read policy, so nobody can list the bucket)
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('menu-photos', 'menu-photos', true)
on conflict (id) do nothing;

drop policy if exists "menu photos public read" on storage.objects;
drop policy if exists "staff upload menu photos" on storage.objects;
create policy "staff upload menu photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu-photos'
              and public.has_role(((storage.foldername(name))[1])::uuid, array['owner','manager']));
drop policy if exists "staff delete menu photos" on storage.objects;
create policy "staff delete menu photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu-photos'
         and public.has_role(((storage.foldername(name))[1])::uuid, array['owner','manager']));

-- give older staff rows a display name
update public.staff s set display_name = coalesce(s.display_name, split_part(u.email, '@', 1))
  from auth.users u where u.id = s.user_id and s.display_name is null;
