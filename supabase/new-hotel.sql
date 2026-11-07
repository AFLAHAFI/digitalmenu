-- =====================================================================
--  Add a new hotel  (run in Supabase → SQL Editor)
--
--  1. Change the 4 values marked  <<<  below, then Run.
--  2. Create the owner's login: Supabase → Authentication → Users →
--     "Add user" → same email + a password (tick "Auto confirm user").
--     The login is linked to the hotel automatically (staff_invites).
--     (If the login already existed, step 1 links it straight away.)
--  3. Staff screens:  https://YOUR-SITE.vercel.app/waiter.html?r=<slug>
--     (kitchen.html, counter.html, admin.html the same way).
--     Customers get the menu only from the QR the waiter opens per table.
-- =====================================================================

with new_r as (
  insert into public.restaurants (slug, name, name_ml, tables_count)
  values ('hotel-saravana',            -- <<< short id used in the QR link (a-z, 0-9, -)
          'Hotel Saravana',            -- <<< name in English
          'ഹോട്ടൽ ശരവണ',               -- <<< name in Malayalam
          8)                           -- <<< number of tables
  returning id
)
insert into public.staff_invites (email, restaurant_id, role)
select 'owner@example.com', new_r.id, 'owner' from new_r;   -- <<< the owner's email

-- links the login now if it already exists
insert into public.staff(user_id, restaurant_id, role)
select u.id, i.restaurant_id, i.role
  from auth.users u join public.staff_invites i on lower(i.email) = lower(u.email)
on conflict do nothing;

-- Optional: starter menu (the owner can edit everything later from the Owner screen)
insert into public.items (restaurant_id, name_en, name_ml, category, price, is_veg, sort)
select r.id, x.name_en, x.name_ml, x.category, x.price, x.is_veg, x.sort
  from public.restaurants r,
  (values
    ('Porotta',        'പൊറോട്ട',          'Breakfast & Snacks', 15,  true,  1),
    ('Appam',          'അപ്പം',             'Breakfast & Snacks', 12,  true,  2),
    ('Puttu',          'പുട്ട്',             'Breakfast & Snacks', 25,  true,  3),
    ('Kadala Curry',   'കടല കറി',          'Curries',            40,  true,  1),
    ('Egg Curry',      'മുട്ട കറി',          'Curries',            45,  false, 2),
    ('Chicken Curry',  'ചിക്കൻ കറി',        'Curries',            110, false, 3),
    ('Beef Fry',       'ബീഫ് ഫ്രൈ',          'Curries',            140, false, 4),
    ('Kerala Meals',   'ഊണ്',              'Meals',              90,  true,  1),
    ('Chicken Biryani','ചിക്കൻ ബിരിയാണി',   'Meals',              160, false, 2),
    ('Tea',            'ചായ',              'Drinks',             12,  true,  1),
    ('Coffee',         'കാപ്പി',            'Drinks',             15,  true,  2)
  ) as x(name_en, name_ml, category, price, is_veg, sort)
 where r.slug = 'hotel-saravana';      -- <<< same slug as above
