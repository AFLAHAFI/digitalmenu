-- Upgrade an existing v2 database to v3 (Phase 5: sizes/add-ons, parcel, bills with
-- discount/GST/split, move table, stock counts). Safe to run twice.
-- Supabase → SQL Editor → paste this file → Run.

alter table public.restaurants add column if not exists gst_rate numeric(5,2) not null default 0;
alter table public.restaurants add column if not exists gst_inclusive boolean not null default false;
alter table public.restaurants add column if not exists gstin text;
alter table public.restaurants add column if not exists parcel_charge numeric(8,2) not null default 0;
alter table public.restaurants add column if not exists bill_footer text;
alter table public.restaurants drop constraint if exists restaurants_gst_check;
alter table public.restaurants add constraint restaurants_gst_check
  check (gst_rate between 0 and 28 and parcel_charge between 0 and 1000 and length(coalesce(bill_footer,'')) <= 200);

alter table public.items add column if not exists variants jsonb not null default '[]'::jsonb;  -- [{name_en,name_ml,price}] e.g. Half / Full
alter table public.items add column if not exists addons jsonb not null default '[]'::jsonb;    -- [{name_en,name_ml,price}] e.g. Extra egg
alter table public.items add column if not exists stock_qty int;                                -- null = not counted
alter table public.items drop constraint if exists items_stock_check;
alter table public.items add constraint items_stock_check check (stock_qty is null or stock_qty >= 0);
alter table public.items drop constraint if exists items_options_check;
alter table public.items add constraint items_options_check
  check (jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) <= 8
     and jsonb_typeof(addons) = 'array' and jsonb_array_length(addons) <= 12);

alter table public.orders add column if not exists order_type text not null default 'dine_in';
alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists customer_phone text;
alter table public.orders add column if not exists bill_id uuid;
alter table public.orders drop constraint if exists orders_order_type_check;
alter table public.orders add constraint orders_order_type_check check (order_type in ('dine_in','parcel'));
alter table public.orders drop constraint if exists orders_pay_method_check;
alter table public.orders add constraint orders_pay_method_check check (pay_method in ('cash','upi','mixed'));

create index if not exists orders_bill_idx on public.orders(bill_id);

-- One row per payment. Orders point to it (orders.bill_id).
create table if not exists public.bills (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  bill_no        int  not null,                 -- resets every day
  table_no       int  not null,                 -- 0 = parcel
  order_type     text not null default 'dine_in',
  subtotal       numeric(10,2) not null,
  discount       numeric(10,2) not null default 0,
  discount_note  text,
  gst_rate       numeric(5,2) not null default 0,
  gst_inclusive  boolean not null default false,
  gst_amount     numeric(10,2) not null default 0,
  round_off      numeric(6,2) not null default 0,
  total          numeric(10,2) not null,
  cash_amount    numeric(10,2) not null default 0,
  upi_amount     numeric(10,2) not null default 0,
  customer_phone text,
  created_by     uuid,
  created_at     timestamptz not null default now()
);
create index if not exists bills_idx on public.bills(restaurant_id, created_at desc);

drop function if exists public.make_order(uuid,int,jsonb,text,text,uuid,uuid,uuid);
drop function if exists public.place_waiter_order(uuid,int,jsonb,text,uuid);

create or replace function public.make_order(
  p_rid uuid, p_table int, p_items jsonb, p_note text, p_source text,
  p_session uuid, p_client_ref uuid, p_created_by uuid,
  p_order_type text default 'dine_in', p_customer_name text default null, p_customer_phone text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r        public.restaurants%rowtype;
  line     jsonb;
  it       public.items%rowtype;
  q        int;
  vi       int;
  v_unit   numeric(10,2);
  v_var    jsonb;
  v_adds   jsonb;
  ai       jsonb;
  k        int;
  left_qty int;
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

  if p_order_type not in ('dine_in','parcel') then raise exception 'Invalid order type'; end if;
  if p_order_type = 'parcel' then
    p_table := 0;
  elsif p_table is null or p_table < 1 or p_table > r.tables_count then
    raise exception 'Invalid table number';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order is empty';
  end if;
  if jsonb_array_length(p_items) > 40 then raise exception 'Too many items in one order'; end if;

  if p_order_type = 'dine_in' then
    select count(*) into v_pending from public.orders
     where restaurant_id = r.id and table_no = p_table and status = 'new';
    if v_pending >= 15 then raise exception 'Too many pending orders for this table'; end if;
  end if;

  for line in select * from jsonb_array_elements(p_items) loop
    q := coalesce((line->>'qty')::int, 0);
    if q < 1 or q > 50 then raise exception 'Invalid quantity'; end if;
    select * into it from public.items where id = (line->>'id')::uuid and restaurant_id = r.id;
    if not found then raise exception 'Item not found'; end if;
    if not it.in_stock then raise exception 'OUT_OF_STOCK:%', it.name_en; end if;

    -- size / variant (e.g. Half, Full): required when the dish has them
    v_unit := it.price; v_var := null;
    if jsonb_array_length(it.variants) > 0 then
      vi := (line->>'variant')::int;
      if vi is null or vi < 0 or vi >= jsonb_array_length(it.variants) then
        raise exception 'CHOOSE_OPTION:%', it.name_en;
      end if;
      v_var := it.variants->vi;
      v_unit := (v_var->>'price')::numeric;
    end if;

    -- add-ons (e.g. Extra egg): any number, each once
    v_adds := '[]'::jsonb;
    if jsonb_typeof(line->'addons') = 'array' then
      for k in select distinct (x)::int from jsonb_array_elements_text(line->'addons') x loop
        if k < 0 or k >= jsonb_array_length(it.addons) then raise exception 'Invalid add-on'; end if;
        ai := it.addons->k;
        v_adds := v_adds || jsonb_build_object('name_en', ai->>'name_en', 'name_ml', ai->>'name_ml', 'price', (ai->>'price')::numeric);
        v_unit := v_unit + (ai->>'price')::numeric;
      end loop;
    end if;

    -- counted stock: take it now; at 0 the dish goes "out of stock"
    if it.stock_qty is not null then
      update public.items set stock_qty = stock_qty - q, in_stock = (stock_qty - q) > 0
       where id = it.id and stock_qty >= q returning stock_qty into left_qty;
      if not found then
        select stock_qty into left_qty from public.items where id = it.id;
        raise exception 'OUT_OF_STOCK:% (only % left)', it.name_en, coalesce(left_qty, 0);
      end if;
    end if;

    out_items := out_items || jsonb_strip_nulls(jsonb_build_object(
      'id', it.id, 'name_en', it.name_en, 'name_ml', it.name_ml,
      'price', v_unit, 'qty', q, 'is_veg', it.is_veg,
      'variant_en', v_var->>'name_en', 'variant_ml', v_var->>'name_ml',
      'addons', case when jsonb_array_length(v_adds) > 0 then v_adds end));
    v_total := v_total + v_unit * q;
  end loop;

  -- parcel: packing charge per order (Settings)
  if p_order_type = 'parcel' and r.parcel_charge > 0 then
    out_items := out_items || jsonb_build_object('id', 'parcel', 'name_en', 'Parcel charge', 'name_ml', 'പാഴ്സൽ ചാർജ്',
                                                 'price', r.parcel_charge, 'qty', 1, 'is_veg', true);
    v_total := v_total + r.parcel_charge;
  end if;

  select coalesce(max(order_no), 0) + 1 into v_no
    from public.orders where restaurant_id = r.id and created_at >= day_start;

  insert into public.orders(restaurant_id, order_no, table_no, items, total, note, source,
                            session_id, client_ref, created_by, order_type, customer_name, customer_phone)
  values (r.id, v_no, p_table, out_items, v_total,
          nullif(left(trim(coalesce(p_note,'')), 200), ''), p_source,
          p_session, p_client_ref, p_created_by, p_order_type,
          nullif(left(trim(coalesce(p_customer_name,'')), 40), ''),
          nullif(left(regexp_replace(coalesce(p_customer_phone,''), '[^0-9+]', '', 'g'), 15), ''))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'order_no', v_no, 'total', v_total);
end $$;

create or replace function public.place_order(p_token uuid, p_items jsonb, p_note text default null, p_client_ref uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.table_sessions%rowtype;
begin
  select * into s from public.live_session(p_token);
  if s.id is null then raise exception 'SESSION_CLOSED'; end if;
  update public.table_sessions set last_activity_at = now() where id = s.id;
  return public.make_order(s.restaurant_id, s.table_no, p_items, p_note, 'customer', s.id, p_client_ref, null);
end $$;

create or replace function public.place_waiter_order(
  p_rid uuid, p_table int, p_items jsonb, p_note text default null, p_client_ref uuid default null,
  p_order_type text default 'dine_in', p_customer_name text default null, p_customer_phone text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  if not public.has_role(p_rid, array['owner','manager','waiter','cashier']) then raise exception 'Not allowed'; end if;
  if coalesce(p_order_type, 'dine_in') = 'dine_in' then
    select id into s from public.table_sessions
     where restaurant_id = p_rid and table_no = p_table and status = 'open' limit 1;
  end if;
  return public.make_order(p_rid, p_table, p_items, p_note, 'waiter', s, p_client_ref, auth.uid(),
                           coalesce(p_order_type, 'dine_in'), p_customer_name, p_customer_phone);
end $$;

create or replace function public.orders_after_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    perform public.log_audit(new.restaurant_id, 'order_cancelled',
      jsonb_build_object('order_no', new.order_no, 'table', new.table_no, 'total', new.total));
    -- give counted stock back
    update public.items i set stock_qty = i.stock_qty + x.q, in_stock = true
      from (select (l->>'id') as id, sum((l->>'qty')::int) as q from jsonb_array_elements(new.items) l
             where l->>'id' ~ '^[0-9a-f-]{36}$' group by 1) x
     where i.id = x.id::uuid and i.restaurant_id = new.restaurant_id and i.stock_qty is not null;
  end if;
  return null;
end $$;
drop trigger if exists orders_after_update on public.orders;
create trigger orders_after_update after update on public.orders
  for each row execute function public.orders_after_update();

-- Take payment for some orders of one table (or one parcel).
-- Works out discount, GST and round-off in the database; payment can be
-- split between cash and UPI. Closes the table's QR when nothing is left unpaid.
create or replace function public.pay_bill(
  p_rid uuid, p_order_ids uuid[], p_discount numeric default 0, p_discount_note text default null,
  p_cash numeric default null, p_upi numeric default null, p_customer_phone text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.restaurants%rowtype;
  n int; n_tables int; v_table int; v_type text;
  v_sub numeric(10,2); v_disc numeric(10,2); v_taxable numeric(10,2); v_gst numeric(10,2) := 0;
  v_total numeric(10,2); v_round numeric(6,2); v_cash numeric(10,2); v_upi numeric(10,2);
  v_method text; v_no int; b public.bills%rowtype;
  day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
begin
  if not public.has_role(p_rid, array['owner','manager','cashier']) then raise exception 'Not allowed'; end if;
  if p_order_ids is null or array_length(p_order_ids, 1) is null then raise exception 'No orders selected'; end if;
  select * into r from public.restaurants where id = p_rid;
  perform pg_advisory_xact_lock(hashtext(p_rid::text || ':bill'));

  select count(*), count(distinct (table_no, order_type)), min(table_no), min(order_type), coalesce(sum(total), 0)
    into n, n_tables, v_table, v_type, v_sub
    from public.orders
   where restaurant_id = p_rid and id = any(p_order_ids) and paid_at is null and status <> 'cancelled';
  if n <> (select count(distinct x) from unnest(p_order_ids) x) then
    raise exception 'Some orders were already paid or cancelled — please refresh';
  end if;
  if n_tables <> 1 then raise exception 'All orders in one bill must be from the same table'; end if;

  v_disc := round(greatest(coalesce(p_discount, 0), 0), 2);
  if v_disc > v_sub then raise exception 'Discount is more than the bill'; end if;
  v_taxable := v_sub - v_disc;
  if r.gst_rate > 0 then
    if r.gst_inclusive then v_gst := round(v_taxable - v_taxable / (1 + r.gst_rate / 100), 2); v_total := v_taxable;
    else v_gst := round(v_taxable * r.gst_rate / 100, 2); v_total := v_taxable + v_gst; end if;
  else v_total := v_taxable; end if;
  v_round := round(v_total) - v_total;           -- round to whole rupees
  v_total := round(v_total);

  if p_cash is null and p_upi is null then v_cash := v_total; v_upi := 0;
  else
    v_cash := round(coalesce(p_cash, 0), 2); v_upi := round(coalesce(p_upi, 0), 2);
    if v_cash < 0 or v_upi < 0 or abs(v_cash + v_upi - v_total) > 0.01 then
      raise exception 'PAY_MISMATCH:%', v_total;
    end if;
  end if;
  v_method := case when v_cash > 0 and v_upi > 0 then 'mixed' when v_upi > 0 then 'upi' else 'cash' end;

  select coalesce(max(bill_no), 0) + 1 into v_no from public.bills where restaurant_id = p_rid and created_at >= day_start;
  insert into public.bills(restaurant_id, bill_no, table_no, order_type, subtotal, discount, discount_note,
                           gst_rate, gst_inclusive, gst_amount, round_off, total, cash_amount, upi_amount, customer_phone, created_by)
  values (p_rid, v_no, v_table, v_type, v_sub, v_disc, nullif(left(trim(coalesce(p_discount_note,'')), 80), ''),
          r.gst_rate, r.gst_inclusive, v_gst, v_round, v_total, v_cash, v_upi,
          nullif(left(regexp_replace(coalesce(p_customer_phone,''), '[^0-9+]', '', 'g'), 15), ''), auth.uid())
  returning * into b;

  update public.orders set paid_at = now(), pay_method = v_method, bill_id = b.id
   where restaurant_id = p_rid and id = any(p_order_ids);

  if v_type = 'dine_in' and not exists (select 1 from public.orders where restaurant_id = p_rid and table_no = v_table
        and order_type = 'dine_in' and paid_at is null and status <> 'cancelled') then
    update public.table_sessions set status = 'closed', closed_at = now()
     where restaurant_id = p_rid and table_no = v_table and status = 'open';
  end if;

  perform public.log_audit(p_rid, 'bill_paid', jsonb_build_object('bill_no', v_no, 'table', v_table, 'amount', v_total,
    'method', v_method, 'orders', n, 'discount', v_disc));
  return to_jsonb(b);
end $$;

-- Old one-tap "paid" (whole table, one method). Kept for older screens.
create or replace function public.mark_table_paid(p_rid uuid, p_table int, p_method text)
returns int language plpgsql security definer set search_path = public as $$
declare ids uuid[]; amt numeric; b jsonb;
begin
  if not public.has_role(p_rid, array['owner','manager','cashier']) then raise exception 'Not allowed'; end if;
  if p_method not in ('cash','upi') then raise exception 'Invalid payment method'; end if;
  select array_agg(id) into ids from public.orders
   where restaurant_id = p_rid and table_no = p_table and order_type = 'dine_in' and paid_at is null and status <> 'cancelled';
  if ids is null then
    update public.table_sessions set status = 'closed', closed_at = now()
     where restaurant_id = p_rid and table_no = p_table and status = 'open';
    return 0;
  end if;
  b := public.pay_bill(p_rid, ids, 0, null, null, null, null);
  if p_method = 'upi' then
    update public.bills set upi_amount = total, cash_amount = 0 where id = (b->>'id')::uuid;
    update public.orders set pay_method = 'upi' where bill_id = (b->>'id')::uuid;
  end if;
  return array_length(ids, 1);
end $$;

-- Move a table's unpaid orders to another table (also merges two tables).
create or replace function public.move_table(p_rid uuid, p_from int, p_to int)
returns int language plpgsql security definer set search_path = public as $$
declare n int; tc int;
begin
  if not public.has_role(p_rid, array['owner','manager','waiter','cashier']) then raise exception 'Not allowed'; end if;
  select tables_count into tc from public.restaurants where id = p_rid;
  if p_from = p_to or p_to < 1 or p_to > tc or p_from < 1 then raise exception 'Invalid table number'; end if;
  perform pg_advisory_xact_lock(hashtext(p_rid::text));
  update public.orders set table_no = p_to
   where restaurant_id = p_rid and table_no = p_from and order_type = 'dine_in' and paid_at is null and status <> 'cancelled';
  get diagnostics n = row_count;
  -- the customers' QR follows them if the new table has none; otherwise it closes
  if exists (select 1 from public.table_sessions where restaurant_id = p_rid and table_no = p_to and status = 'open') then
    update public.table_sessions set status = 'closed', closed_at = now()
     where restaurant_id = p_rid and table_no = p_from and status = 'open';
  else
    update public.table_sessions set table_no = p_to where restaurant_id = p_rid and table_no = p_from and status = 'open';
  end if;
  perform public.log_audit(p_rid, 'table_moved', jsonb_build_object('from', p_from, 'to', p_to, 'orders', n));
  return n;
end $$;

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
                 'photos', i.photos, 'description', i.description, 'is_special', i.is_special, 'sort', i.sort,
                 'variants', i.variants, 'addons', i.addons, 'stock_qty', i.stock_qty)
               order by i.category, i.sort, i.name_en)
               from public.items i where i.restaurant_id = s.restaurant_id), '[]'::jsonb));
end $$;

-- counted stock: kitchen/manager set how many are left (null = stop counting)
create or replace function public.set_stock_qty(p_item uuid, p_qty int)
returns void language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  select restaurant_id into rid from public.items where id = p_item;
  if rid is null or not public.has_role(rid, array['owner','manager','kitchen']) then raise exception 'Not allowed'; end if;
  if p_qty is not null and (p_qty < 0 or p_qty > 100000) then raise exception 'Invalid quantity'; end if;
  update public.items set stock_qty = p_qty, in_stock = case when p_qty is null then in_stock else p_qty > 0 end where id = p_item;
end $$;

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
    select (x->>'id') || coalesce('|' || (x->>'variant_en'), '') as id,
           max(x->>'name_en') || coalesce(' (' || max(x->>'variant_en') || ')', '') as name_en,
           max(x->>'name_ml') || coalesce(' (' || max(coalesce(x->>'variant_ml', x->>'variant_en')) || ')', '') as name_ml,
           sum((x->>'qty')::int) as qty, sum((x->>'qty')::int * (x->>'price')::numeric) as amount
      from ok, jsonb_array_elements(ok.items) x where x->>'id' <> 'parcel' group by 1
  ),
  bl as (select * from public.bills where restaurant_id = p_rid and created_at >= p_from and created_at < p_to),
  legacy as (select * from ok where paid_at is not null and bill_id is null)
  select jsonb_build_object(
    'sales',        coalesce((select sum(total) from ok), 0),
    'paid',         coalesce((select sum(total) from ok where paid_at is not null), 0),
    'unpaid',       coalesce((select sum(total) from ok where paid_at is null), 0),
    'cash',         coalesce((select sum(cash_amount) from bl), 0) + coalesce((select sum(total) from legacy where pay_method = 'cash'), 0),
    'upi',          coalesce((select sum(upi_amount) from bl), 0) + coalesce((select sum(total) from legacy where pay_method = 'upi'), 0),
    'collected',    coalesce((select sum(total) from bl), 0) + coalesce((select sum(total) from legacy), 0),
    'discount',     coalesce((select sum(discount) from bl), 0),
    'gst',          coalesce((select sum(gst_amount) from bl), 0),
    'orders',       (select count(*) from ok),
    'parcels',      (select count(*) from ok where order_type = 'parcel'),
    'bills',        (select count(*) from bl) + (select count(distinct (table_no, paid_at)) from legacy),
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

create or replace function public.report_orders(p_rid uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(p_rid, array['owner','manager']) then raise exception 'Not allowed'; end if;
  if p_to <= p_from or p_to - p_from > interval '400 days' then raise exception 'Invalid date range'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'order_no', o.order_no, 'created_at', o.created_at, 'table_no', o.table_no, 'status', o.status,
      'source', o.source, 'staff', coalesce(s.display_name, s.username), 'type', o.order_type,
      'customer', o.customer_name, 'bill_no', (select b.bill_no from public.bills b where b.id = o.bill_id),
      'items', (select string_agg((x->>'qty') || ' x ' || (x->>'name_en'), ', ') from jsonb_array_elements(o.items) x),
      'total', o.total, 'pay_method', o.pay_method, 'paid_at', o.paid_at) order by o.created_at)
    from (select * from public.orders where restaurant_id = p_rid and created_at >= p_from and created_at < p_to
          order by created_at limit 20000) o
    left join public.staff s on s.user_id = o.created_by and s.restaurant_id = p_rid), '[]'::jsonb);
end $$;

revoke all on function public.make_order(uuid,int,jsonb,text,text,uuid,uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.place_waiter_order(uuid,int,jsonb,text,uuid,text,text,text) from public, anon;
revoke all on function public.pay_bill(uuid,uuid[],numeric,text,numeric,numeric,text) from public, anon;
revoke all on function public.move_table(uuid,int,int) from public, anon;
revoke all on function public.set_stock_qty(uuid,int) from public, anon;
revoke all on function public.mark_table_paid(uuid,int,text) from public, anon;
grant execute on function public.place_order(uuid,jsonb,text,uuid) to anon, authenticated;
grant execute on function public.place_waiter_order(uuid,int,jsonb,text,uuid,text,text,text) to authenticated;
grant execute on function public.pay_bill(uuid,uuid[],numeric,text,numeric,numeric,text) to authenticated;
grant execute on function public.move_table(uuid,int,int) to authenticated;
grant execute on function public.set_stock_qty(uuid,int) to authenticated;
grant execute on function public.mark_table_paid(uuid,int,text) to authenticated;
grant update (name, name_ml, tables_count, upi_id, logo_url, banner_url, theme_color, category_photos,
              gst_rate, gst_inclusive, gstin, parcel_charge, bill_footer)
  on public.restaurants to authenticated;
revoke insert, update, delete on public.bills from anon, authenticated;
alter table public.bills enable row level security;
drop policy if exists "staff read bills" on public.bills;
create policy "staff read bills" on public.bills for select to authenticated using (public.is_staff(restaurant_id));
do $$ begin
  begin alter publication supabase_realtime add table public.bills; exception when others then null; end;
end $$;
