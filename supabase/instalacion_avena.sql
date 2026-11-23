-- Instalación para un proyecto Supabase independiente de Avena Cubana Pop.
BEGIN;

-- schema.sql
-- Avena Cubana Pop - estructura inicial de Supabase
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Los correos habilitados se administran desde PostgreSQL, no desde el navegador.
create table if not exists public.admin_emails (email text primary key);
alter table public.admin_emails enable row level security;
revoke all on public.admin_emails from anon, authenticated;
create or replace function public.is_la_tuba_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select auth.uid() is not null and exists (select 1 from public.admin_emails where email = lower(auth.jwt()->>'email')) $$;
revoke all on function public.is_la_tuba_admin() from public;
grant execute on function public.is_la_tuba_admin() to anon, authenticated;

-- Cuentas autorizadas para caja o turnos; el administrador sigue en admin_emails.
create table if not exists public.staff_accounts (
  email text primary key check (email = lower(email)),
  role text not null check (role in ('caja', 'manana', 'tarde')),
  active boolean not null default true
);
alter table public.staff_accounts enable row level security;
revoke all on public.staff_accounts from anon, authenticated;
create or replace function public.is_avena_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_la_tuba_admin() or (auth.uid() is not null and exists
    (select 1 from public.staff_accounts where email=lower(auth.jwt()->>'email') and active));
$$;
revoke all on function public.is_avena_staff() from public;
grant execute on function public.is_avena_staff() to authenticated;

create table if not exists public.daily_menus (
  id uuid primary key default gen_random_uuid(),
  scheduled_date date not null unique,
  title text not null default 'Menú del día',
  date_label text not null default 'Hoy',
  price integer not null check (price >= 0),
  active boolean not null default false,
  soups jsonb not null default '[]'::jsonb,
  sides jsonb not null default '[]'::jsonb,
  proteins jsonb not null default '[]'::jsonb,
  specials jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Catálogo exclusivo de Avena Cubana Pop. La categoría vive en el producto para evitar
-- una administración separada y no se importan referencias de Avena Cubana Pop.
create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  category text not null,
  item_type text not null check (item_type in ('carta', 'bebida', 'otro')),
  price integer not null check (price >= 0),
  image_url text,
  available boolean not null default true,
  business text not null default 'la_tuba' check (business = 'la_tuba'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists catalog_items_business_name_unique
  on public.catalog_items (business, lower(name));

-- Existencias de insumos y productos. Los movimientos conservan una referencia
-- opcional a pedidos para permitir una integración posterior sin descuentos automáticos.
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  unit text not null check (length(trim(unit)) > 0),
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  minimum_quantity numeric(14,3) not null default 0 check (minimum_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity_change numeric(14,3) not null check (quantity_change <> 0),
  reason text not null,
  order_id uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
drop policy if exists "Admins read inventory" on public.inventory_items;
create policy "Admins read inventory" on public.inventory_items for select to authenticated using (public.is_avena_staff());
drop policy if exists "Admins edit inventory details" on public.inventory_items;
create policy "Admins edit inventory details" on public.inventory_items for update to authenticated using (public.is_la_tuba_admin()) with check (public.is_la_tuba_admin());
drop policy if exists "Admins read inventory movements" on public.inventory_movements;
create policy "Admins read inventory movements" on public.inventory_movements for select to authenticated using (public.is_avena_staff());
revoke all on public.inventory_items, public.inventory_movements from anon, authenticated;
grant select on public.inventory_items, public.inventory_movements to authenticated;
grant update (name, unit, minimum_quantity, updated_at) on public.inventory_items to authenticated;

create or replace function public.create_inventory_item(p_name text, p_unit text, p_minimum numeric, p_initial numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare item_id uuid;
begin
  if not public.is_la_tuba_admin() then raise exception 'Acceso denegado'; end if;
  if p_initial is null or p_initial < 0 or p_minimum is null or p_minimum < 0 then raise exception 'Las cantidades deben ser positivas o cero'; end if;
  insert into public.inventory_items(name, unit, quantity, minimum_quantity) values (trim(p_name), trim(p_unit), p_initial, p_minimum) returning id into item_id;
  if p_initial > 0 then insert into public.inventory_movements(inventory_item_id, quantity_change, reason) values (item_id, p_initial, 'Existencia inicial'); end if;
  return item_id;
end $$;

create or replace function public.adjust_inventory(p_item_id uuid, p_change numeric, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_avena_staff() then raise exception 'Acceso denegado'; end if;
  if p_change < 0 and not public.is_la_tuba_admin() then raise exception 'Solo el administrador puede registrar salidas manuales'; end if;
  if p_change is null or p_change = 0 or nullif(trim(p_reason), '') is null then raise exception 'Indica una cantidad y un motivo'; end if;
  update public.inventory_items set quantity = quantity + p_change, updated_at = now() where id = p_item_id and quantity + p_change >= 0;
  if not found then raise exception 'Insumo no encontrado o existencias insuficientes'; end if;
  insert into public.inventory_movements(inventory_item_id, quantity_change, reason) values (p_item_id, p_change, trim(p_reason));
end $$;
revoke all on function public.create_inventory_item(text,text,numeric,numeric) from public;
revoke all on function public.adjust_inventory(uuid,numeric,text) from public;
grant execute on function public.create_inventory_item(text,text,numeric,numeric), public.adjust_inventory(uuid,numeric,text) to authenticated;

-- Cada producto puede necesitar varios insumos; un insumo puede servir a varios productos.
create table if not exists public.catalog_inventory_requirements (
  catalog_item_id uuid not null references public.catalog_items(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  quantity_required numeric(14,3) not null check (quantity_required > 0),
  primary key (catalog_item_id, inventory_item_id)
);
alter table public.catalog_inventory_requirements enable row level security;
drop policy if exists "Admins manage inventory links" on public.catalog_inventory_requirements;
create policy "Admins manage inventory links" on public.catalog_inventory_requirements for all to authenticated using (public.is_la_tuba_admin()) with check (public.is_la_tuba_admin());
revoke all on public.catalog_inventory_requirements from anon, authenticated;
grant select, insert, update, delete on public.catalog_inventory_requirements to authenticated;

create or replace function public.set_inventory_links(p_inventory_id uuid, p_links jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_la_tuba_admin() then raise exception 'Acceso denegado'; end if;
  if jsonb_typeof(p_links) <> 'array' then raise exception 'Lista de productos inválida'; end if;
  delete from public.catalog_inventory_requirements where inventory_item_id = p_inventory_id;
  insert into public.catalog_inventory_requirements(inventory_item_id, catalog_item_id, quantity_required)
  select p_inventory_id, (entry->>'id')::uuid, (entry->>'quantity')::numeric from jsonb_array_elements(p_links) entry;
end $$;
revoke all on function public.set_inventory_links(uuid,jsonb) from public;
grant execute on function public.set_inventory_links(uuid,jsonb) to authenticated;

create or replace function public.public_catalog_items()
returns setof public.catalog_items language sql stable security definer set search_path = public as $$
  select c.* from public.catalog_items c
  where c.available and c.business = 'la_tuba' and not exists (
    select 1 from public.catalog_inventory_requirements r join public.inventory_items i on i.id = r.inventory_item_id
    where r.catalog_item_id = c.id and i.quantity < r.quantity_required
  )
$$;
revoke all on function public.public_catalog_items() from public;
grant execute on function public.public_catalog_items() to anon, authenticated;

-- Incluye personas registradas o identificadas por teléfono, aunque todavía
-- no hayan comprado. No debe usarse directamente para estadísticas de clientes.
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text not null,
  email text,
  birthday text,
  addresses jsonb not null default '[]'::jsonb,
  order_count integer not null default 0,
  total_spent integer not null default 0,
  first_order_at timestamptz,
  last_order_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trata el prefijo colombiano opcional como el mismo celular, sin alterar
-- números internacionales ni modificar los contactos ya almacenados.
create or replace function public.normalized_contact_phone(input_phone text)
returns text language sql immutable as $$
  select case when length(digits) = 12 and left(digits, 2) = '57' then substring(digits from 3) else digits end
  from (select regexp_replace(coalesce(input_phone, ''), '\D', '', 'g') digits) p
$$;
create or replace function public.existing_contact_phone(input_phone text)
returns text language plpgsql stable security definer set search_path = public as $$
declare normalized text := public.normalized_contact_phone(input_phone); existing text; matches integer;
begin
  select count(*), min(phone) into matches, existing from public.contacts where public.normalized_contact_phone(phone) = normalized;
  if matches > 1 then raise exception 'Existen varios contactos con este número; el administrador debe revisarlos'; end if;
  return coalesce(existing, normalized);
end $$;
revoke all on function public.existing_contact_phone(text) from public;

drop function if exists public.get_verified_contact();

-- Búsqueda solicitada por Avena Cubana Pop: expone únicamente los datos necesarios
-- para completar un pedido o reserva al introducir el celular exacto.
create or replace function public.get_contact_by_phone(p_phone text)
returns table (name text, email text, birthday text, addresses jsonb)
language plpgsql stable security definer set search_path = public as $$
declare clean text := public.normalized_contact_phone(p_phone);
begin
  if length(clean) < 7 or length(clean) > 15 then return; end if;
  if (select count(*) from public.contacts c where public.normalized_contact_phone(c.phone) = clean) <> 1 then return; end if;
  return query select c.name, c.email, c.birthday, c.addresses from public.contacts c where public.normalized_contact_phone(c.phone) = clean;
end $$;
revoke all on function public.get_contact_by_phone(text) from public;
grant execute on function public.get_contact_by_phone(text) to anon, authenticated;

-- Una solicitud no bloquea mesas ni implica disponibilidad confirmada.
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete set null,
  customer_name text not null,
  phone text not null,
  reservation_date date not null,
  reservation_time time not null,
  party_size integer not null check (party_size > 0 and party_size <= 500),
  space_type text not null check (space_type in ('mesas', 'lugar_completo')),
  requested_tables integer check (requested_tables between 1 and 7),
  decoration text,
  notes text,
  assigned_tables integer[] not null default '{}',
  status text not null default 'pendiente' check (status in ('pendiente','confirmada','cancelada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((space_type = 'mesas' and requested_tables is not null) or (space_type = 'lugar_completo' and requested_tables is null)),
  check (assigned_tables <@ array[1,2,3,4,5,6,7])
);
alter table public.reservations enable row level security;
drop policy if exists "Admins manage reservations" on public.reservations;
create policy "Admins manage reservations" on public.reservations for all to authenticated using (public.is_la_tuba_admin()) with check (public.is_la_tuba_admin());
revoke all on public.reservations from anon, authenticated;
grant select, update on public.reservations to authenticated;

create or replace function public.create_reservation_request(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare clean_phone text; contact_id uuid; new_id uuid; customer_name text;
begin
  clean_phone := regexp_replace(coalesce(payload->>'phone', ''), '\D', '', 'g');
  customer_name := trim(coalesce(payload->>'name', ''));
  if length(clean_phone) < 7 or length(clean_phone) > 15 or length(customer_name) < 2 then raise exception 'Indica un nombre y celular válidos'; end if;
  if (payload->>'date')::date < (now() at time zone 'America/Bogota')::date then raise exception 'La fecha debe ser hoy o posterior'; end if;
  insert into public.contacts(phone, name) values (clean_phone, customer_name)
    on conflict (phone) do update set updated_at = now() returning id into contact_id;
  insert into public.reservations(contact_id, customer_name, phone, reservation_date, reservation_time, party_size, space_type, requested_tables, decoration, notes)
  values (contact_id, customer_name, clean_phone, (payload->>'date')::date, (payload->>'time')::time,
    (payload->>'people')::integer, payload->>'space', nullif(payload->>'tables', '')::integer,
    nullif(trim(payload->>'decoration'), ''), nullif(trim(payload->>'notes'), '')) returning id into new_id;
  return new_id;
end $$;

create or replace function public.manage_reservation(p_id uuid, p_status text, p_tables integer[])
returns void language plpgsql security definer set search_path = public as $$
declare current_res public.reservations%rowtype; start_at timestamptz;
begin
  if not public.is_la_tuba_admin() then raise exception 'Acceso denegado'; end if;
  if p_status not in ('pendiente','confirmada','cancelada') or p_tables is null or not p_tables <@ array[1,2,3,4,5,6,7] or cardinality(p_tables) <> (select count(distinct n) from unnest(p_tables) n) then raise exception 'Asignación inválida'; end if;
  perform pg_advisory_xact_lock(hashtext('la_tuba_reservations'));
  select * into current_res from public.reservations where id = p_id for update;
  if not found then raise exception 'Reserva no encontrada'; end if;
  if current_res.space_type = 'lugar_completo' and cardinality(p_tables) > 0 then raise exception 'La reserva es para todo el lugar'; end if;
  if p_status = 'confirmada' and current_res.space_type = 'mesas' and cardinality(p_tables) <> current_res.requested_tables then raise exception 'Selecciona las mesas necesarias'; end if;
  if p_status <> 'cancelada' then
    start_at := (current_res.reservation_date + current_res.reservation_time) at time zone 'America/Bogota';
    if exists (select 1 from public.reservations r where r.id <> p_id and r.status in ('pendiente','confirmada')
      and (r.reservation_date + r.reservation_time) at time zone 'America/Bogota' < start_at + make_interval(mins => current_res.duration_minutes)
      and (r.reservation_date + r.reservation_time) at time zone 'America/Bogota' + make_interval(mins => r.duration_minutes) > start_at
      and (current_res.space_type = 'lugar_completo' or r.space_type = 'lugar_completo' or r.assigned_tables && p_tables)) then raise exception 'Una de estas mesas ya está asignada en ese horario'; end if;
  end if;
  update public.reservations set status = p_status, assigned_tables = p_tables, updated_at = now() where id = p_id;
end $$;
revoke all on function public.manage_reservation(uuid,text,integer[]) from public;
grant execute on function public.manage_reservation(uuid,text,integer[]) to authenticated;
revoke all on function public.create_reservation_request(jsonb) from public;
grant execute on function public.create_reservation_request(jsonb) to anon, authenticated;

create table if not exists public.reservation_settings (
  id integer primary key default 1 check (id = 1),
  open_days integer[] not null default '{}',
  slots text[] not null default '{}',
  duration_minutes integer not null default 120 check (duration_minutes between 15 and 720),
  seats_per_table integer not null default 0 check (seats_per_table between 0 and 100),
  decoration_price integer check (decoration_price > 0)
);
insert into public.reservation_settings(id) values (1) on conflict do nothing;
alter table public.reservation_settings enable row level security;
drop policy if exists "Admins manage reservation settings" on public.reservation_settings;
create policy "Admins manage reservation settings" on public.reservation_settings for all to authenticated using (public.is_la_tuba_admin()) with check (public.is_la_tuba_admin());
revoke all on public.reservation_settings from anon, authenticated;
grant select, update on public.reservation_settings to authenticated;
alter table public.reservations add column if not exists duration_minutes integer not null default 120;
alter table public.reservations add column if not exists decoration_price integer;
alter table public.reservations add column if not exists occasion text;
alter table public.reservations add column if not exists allergies text;

create or replace function public.get_reservation_settings()
returns table (seats_per_table integer, decoration_price integer)
language sql stable security definer set search_path = public as $$
  select s.seats_per_table, s.decoration_price from public.reservation_settings s where s.id = 1
$$;
revoke all on function public.get_reservation_settings() from public;
grant execute on function public.get_reservation_settings() to anon, authenticated;

create or replace function public.get_reservation_slots(p_from date, p_to date, p_people integer, p_space text)
returns table (available_date date, slot text, remaining_tables integer)
language plpgsql stable security definer set search_path = public as $$
declare settings public.reservation_settings%rowtype; day date; t text; start_at timestamptz; occupied integer; needed integer;
begin
  select * into settings from public.reservation_settings where id = 1;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 90 or p_people is null or p_people < 2 or p_space not in ('mesas','lugar_completo') or settings.seats_per_table < 1 then return; end if;
  needed := case when p_space = 'lugar_completo' then 7 else ceil(p_people::numeric / settings.seats_per_table)::integer end;
  if p_people > settings.seats_per_table * 7 or needed > 7 then return; end if;
  for day in select generate_series(p_from, p_to, '1 day'::interval)::date loop
    if extract(isodow from day)::integer = any(settings.open_days) then
      foreach t in array settings.slots loop
        if t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then continue; end if;
        start_at := (day + t::time) at time zone 'America/Bogota';
        if start_at <= now() then continue; end if;
        select coalesce(sum(case when r.space_type = 'lugar_completo' then 7 else r.requested_tables end),0)::integer into occupied
        from public.reservations r
        where r.status in ('pendiente','confirmada')
          and (r.reservation_date + r.reservation_time) at time zone 'America/Bogota' < start_at + make_interval(mins => settings.duration_minutes)
          and (r.reservation_date + r.reservation_time) at time zone 'America/Bogota' + make_interval(mins => r.duration_minutes) > start_at;
        if 7 - occupied >= needed then available_date := day; slot := t; remaining_tables := greatest(7 - occupied,0); return next; end if;
      end loop;
    end if;
  end loop;
end $$;
revoke all on function public.get_reservation_slots(date,date,integer,text) from public;
grant execute on function public.get_reservation_slots(date,date,integer,text) to anon, authenticated;

create or replace function public.create_reservation_request(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare clean_phone text; contact_id uuid; new_id uuid; customer_name text; settings public.reservation_settings%rowtype; reservation_day date; reservation_clock time; people integer; space text; tables integer; decoration text; birthday text;
begin
  perform pg_advisory_xact_lock(hashtext('la_tuba_reservations'));
  select * into settings from public.reservation_settings where id = 1;
  clean_phone := public.existing_contact_phone(payload->>'phone'); customer_name := trim(coalesce(payload->>'name', ''));
  if length(clean_phone) < 7 or length(clean_phone) > 15 or length(customer_name) < 2 then raise exception 'Indica un nombre y celular válidos'; end if;
  reservation_day := (payload->>'date')::date; reservation_clock := (payload->>'time')::time; people := (payload->>'people')::integer; space := payload->>'space';
  if reservation_day > (now() at time zone 'America/Bogota')::date + 90 or not exists (select 1 from public.get_reservation_slots(reservation_day,reservation_day,people,space) available where available.slot::time = reservation_clock) then raise exception 'La fecha u hora ya no está disponible'; end if;
  tables := case when space = 'mesas' then ceil(people::numeric / settings.seats_per_table)::integer else null end;
  decoration := nullif(trim(payload->>'decoration'), '');
  if decoration is not null and (settings.decoration_price is null or ((reservation_day + reservation_clock) at time zone 'America/Bogota') < now() + interval '8 hours') then raise exception 'La decoración requiere al menos 8 horas de antelación y un precio configurado'; end if;
  birthday := nullif(trim(payload->>'birthday'), '');
  if birthday is not null then birthday := to_char(birthday::date, 'MM-DD'); end if;
  insert into public.contacts(phone, name, birthday) values (clean_phone, customer_name, birthday)
    on conflict (phone) do update set name = excluded.name, birthday = coalesce(excluded.birthday, public.contacts.birthday), updated_at = now() returning id into contact_id;
  insert into public.reservations(contact_id, customer_name, phone, reservation_date, reservation_time, party_size, space_type, requested_tables, decoration, notes, occasion, allergies, duration_minutes, decoration_price)
  values (contact_id, customer_name, clean_phone, reservation_day, reservation_clock, people, space, tables, decoration, nullif(trim(payload->>'notes'), ''), nullif(trim(payload->>'occasion'), ''), nullif(trim(payload->>'allergies'), ''), settings.duration_minutes, case when decoration is null then null else settings.decoration_price end) returning id into new_id;
  return new_id;
end $$;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references public.contacts(id) on delete set null,
  customer jsonb not null,
  items jsonb not null,
  subtotal integer not null,
  delivery integer not null default 0,
  total integer not null,
  service text not null check (service in ('local', 'llevar', 'domicilio')),
  payment_method text not null,
  status text not null default 'no_pagado',
  comments text,
  location jsonb,
  promotions jsonb not null default '[]'::jsonb,
  discount_total integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_movements_order_id_fkey' and conrelid = 'public.inventory_movements'::regclass) then
    alter table public.inventory_movements add constraint inventory_movements_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
  end if;
end $$;

alter table public.orders add column if not exists business text not null default 'la_tuba';
alter table public.orders add column if not exists sale_type text not null default 'carta';
alter table public.orders add column if not exists channel text not null default 'web';
alter table public.orders add column if not exists admin_note text;
alter table public.orders add column if not exists payment_details jsonb;
alter table public.orders add column if not exists delivery_amount integer;
alter table public.orders add column if not exists business_amount integer;
alter table public.orders add column if not exists status_history jsonb not null default '[]'::jsonb;

create or replace function public.set_order_item_served(p_order_id uuid, p_item_id text, p_served boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_la_tuba_admin() then raise exception 'Acceso denegado'; end if;
  update public.orders o set items = (
    select coalesce(jsonb_agg(case when element->>'id' = p_item_id then jsonb_set(element, '{servido}', to_jsonb(p_served), true) else element end order by ord), '[]'::jsonb)
    from jsonb_array_elements(o.items) with ordinality as entry(element, ord)
  ), updated_at = now()
  where o.id = p_order_id and o.business = 'la_tuba' and o.service = 'local'
    and exists (select 1 from jsonb_array_elements(o.items) element where element->>'id' = p_item_id);
  if not found then raise exception 'Pedido o producto no encontrado'; end if;
end $$;
revoke all on function public.set_order_item_served(uuid,text,boolean) from public;
grant execute on function public.set_order_item_served(uuid,text,boolean) to authenticated;

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null default '{}'::jsonb,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.promotions enable row level security;
drop policy if exists "Public can read active promotions" on public.promotions;
create policy "Public can read active promotions" on public.promotions for select using (active);
drop policy if exists "Authenticated users manage promotions" on public.promotions;
create policy "Authenticated users manage promotions" on public.promotions for all to authenticated using (public.is_la_tuba_admin()) with check (public.is_la_tuba_admin());
grant select on public.promotions to anon, authenticated;
grant insert, update, delete on public.promotions to authenticated;
alter table public.orders drop constraint if exists orders_business_check;
alter table public.orders add constraint orders_business_check check (business = 'la_tuba');
alter table public.orders drop constraint if exists orders_sale_type_check;
alter table public.orders add constraint orders_sale_type_check check (sale_type in ('menu_dia', 'carta', 'bebida', 'otro', 'mixto'));
alter table public.orders drop constraint if exists orders_channel_check;
alter table public.orders add constraint orders_channel_check check (channel in ('web', 'admin'));

alter table public.app_settings enable row level security;
alter table public.daily_menus enable row level security;
alter table public.catalog_items enable row level security;
alter table public.contacts enable row level security;
alter table public.orders enable row level security;

drop policy if exists "Public can read active daily menus" on public.daily_menus;
create policy "Public can read active daily menus" on public.daily_menus
  for select using (active = true);

drop policy if exists "Authenticated users manage daily menus" on public.daily_menus;
create policy "Authenticated users manage daily menus" on public.daily_menus
  for all to authenticated using (public.is_la_tuba_admin()) with check (public.is_la_tuba_admin());

drop policy if exists "Public can read available catalog" on public.catalog_items;
create policy "Public can read available catalog" on public.catalog_items
  for select using (available = true and business = 'la_tuba');

drop policy if exists "Authenticated users manage catalog" on public.catalog_items;
create policy "Authenticated users manage catalog" on public.catalog_items
  for all to authenticated using (business = 'la_tuba' and public.is_la_tuba_admin()) with check (business = 'la_tuba' and public.is_la_tuba_admin());

drop policy if exists "Anyone can create orders" on public.orders;

drop policy if exists "Authenticated users manage orders" on public.orders;
create policy "Authenticated users manage orders" on public.orders
  for all to authenticated using (public.is_la_tuba_admin()) with check (public.is_la_tuba_admin());

drop policy if exists "Anyone can create contacts" on public.contacts;

drop policy if exists "Authenticated users manage contacts" on public.contacts;
create policy "Authenticated users manage contacts" on public.contacts
  for all to authenticated using (public.is_la_tuba_admin()) with check (public.is_la_tuba_admin());

drop policy if exists "Authenticated users manage settings" on public.app_settings;
create policy "Authenticated users manage settings" on public.app_settings
  for all to authenticated using (public.is_la_tuba_admin()) with check (public.is_la_tuba_admin());

-- Solo estas personas cuentan como clientes en el panel y las estadísticas.
-- Un contacto aparece aquí después de registrar su primer pedido.
alter table public.contacts add column if not exists document_number text;
alter table public.contacts add column if not exists admin_note text;
alter table public.contacts add column if not exists tags text[] not null default '{}';
create or replace view public.customers
with (security_invoker = true)
as
select
  id,
  phone,
  name,
  email,
  birthday,
  addresses,
  order_count,
  total_spent,
  first_order_at,
  last_order_at,
  created_at,
  updated_at,
  document_number,
  admin_note,
  tags
from public.contacts
where order_count > 0;

-- Base separada para seguimiento de personas que aún no han comprado.
-- Puede mostrarse en una sección futura de "Contactos", sin mezclarse con Clientes.
create or replace view public.prospects
with (security_invoker = true)
as
select
  id,
  phone,
  name,
  email,
  birthday,
  addresses,
  created_at,
  updated_at
from public.contacts
where order_count = 0;

-- Mantiene automáticamente las estadísticas del contacto cuando se crea,
-- cambia o elimina un pedido. Los pedidos cancelados no cuentan.
create or replace function public.refresh_contact_purchase_stats(target_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.contacts contact
  set
    order_count = stats.order_count,
    total_spent = stats.total_spent,
    first_order_at = stats.first_order_at,
    last_order_at = stats.last_order_at,
    updated_at = now()
  from (
    select
      count(*) filter (where status <> 'cancelado')::integer as order_count,
      coalesce(sum(total) filter (where status <> 'cancelado'), 0)::integer as total_spent,
      min(created_at) filter (where status <> 'cancelado') as first_order_at,
      max(created_at) filter (where status <> 'cancelado') as last_order_at
    from public.orders
    where customer_id = target_contact_id
  ) stats
  where contact.id = target_contact_id;
end;
$$;

create or replace function public.sync_contact_purchase_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.customer_id is not null then
    perform public.refresh_contact_purchase_stats(old.customer_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.customer_id is not null then
    perform public.refresh_contact_purchase_stats(new.customer_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_contact_stats_after_order on public.orders;
create trigger sync_contact_stats_after_order
after insert or update of status, total, customer_id or delete on public.orders
for each row execute function public.sync_contact_purchase_stats();

-- Registra el contacto y su pedido en una sola transacción segura.
create or replace function public.create_public_order(payload jsonb)
returns table (id uuid, order_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_phone text;
  contact_id uuid;
  customer_data jsonb;
  address_data jsonb;
  saved_order public.orders%rowtype;
  admin_sale boolean;
begin
  customer_data := coalesce(payload->'cliente', '{}'::jsonb);
  admin_sale := public.is_avena_staff() and payload->>'canal' = 'admin';
  clean_phone := public.existing_contact_phone(customer_data->>'celular');
  if clean_phone = '' and not admin_sale then raise exception 'El número de celular es obligatorio'; end if;
  if not admin_sale and payload->>'servicio' = 'local' and coalesce(customer_data->>'mesa', '') not in ('1','2','3','4','5','6','7') then
    raise exception 'Selecciona una mesa válida';
  end if;

  -- Comprueba el consumo combinado de insumos compartidos al confirmar.
  if exists (
    select 1 from public.inventory_items i
    join public.catalog_inventory_requirements r on r.inventory_item_id = i.id
    join jsonb_array_elements(coalesce(payload->'items', '[]'::jsonb)) item on item->'product'->>'id' = r.catalog_item_id::text
    group by i.id, i.quantity
    having sum(r.quantity_required * greatest(coalesce((item->>'qty')::numeric, 0), 0)) > i.quantity
  ) then raise exception 'No hay existencias suficientes para uno o más productos. Actualiza tu pedido.'; end if;

  if nullif(trim(customer_data->>'direccion'), '') is not null then
    address_data := jsonb_build_object(
      'direccion', trim(customer_data->>'direccion'),
      'barrio', nullif(trim(customer_data->>'barrio'), ''),
      'referencia', nullif(trim(customer_data->>'referencia'), ''),
      'lastUsed', now()
    );
  end if;

  if clean_phone <> '' then
  insert into public.contacts (phone, name, email, birthday, addresses)
  values (
    clean_phone,
    coalesce(nullif(trim(customer_data->>'nombres'), ''), 'Cliente'),
    nullif(trim(customer_data->>'correo'), ''),
    nullif(trim(customer_data->>'fechaNacimiento'), ''),
    case when address_data is null then '[]'::jsonb else jsonb_build_array(address_data) end
  )
  on conflict (phone) do update set
    name = excluded.name,
    email = coalesce(excluded.email, contacts.email),
    birthday = coalesce(excluded.birthday, contacts.birthday),
    addresses = case
      when address_data is null then contacts.addresses
      when exists (
        select 1 from jsonb_array_elements(contacts.addresses) saved
        where lower(trim(saved->>'direccion')) = lower(trim(address_data->>'direccion'))
      ) then (
        select coalesce(jsonb_agg(case
          when lower(trim(saved->>'direccion')) = lower(trim(address_data->>'direccion')) then saved || address_data
          else saved end), '[]'::jsonb)
        from jsonb_array_elements(contacts.addresses) saved
      )
      else contacts.addresses || jsonb_build_array(address_data)
    end,
    updated_at = now()
  returning contacts.id into contact_id;
  end if;

  insert into public.orders (
    order_number, customer_id, customer, items, subtotal, delivery, total,
    service, payment_method, status, comments, location, promotions, discount_total,
    business, sale_type, channel
  ) values (
    payload->>'numeroOrden', contact_id,
    customer_data || jsonb_build_object('celular', clean_phone),
    coalesce(payload->'items', '[]'::jsonb),
    coalesce((payload->>'subtotal')::integer, 0),
    coalesce((payload->>'delivery')::integer, 0),
    coalesce((payload->>'total')::integer, 0),
    payload->>'servicio', payload->>'formaPago',
    case when admin_sale then coalesce(payload->>'estado', 'no_pagado') else 'no_pagado' end,
    nullif(trim(payload->>'comentarios'), ''), customer_data->'coordenadas',
    coalesce(payload->'promociones', '[]'::jsonb),
    coalesce((payload->>'descuentoTotal')::integer, 0),
    'la_tuba', coalesce(payload->>'tipoVenta', 'carta'), case when admin_sale then 'admin' else 'web' end
  ) returning * into saved_order;

  return query select saved_order.id, saved_order.order_number;
end;
$$;

revoke all on function public.create_public_order(jsonb) from public;
grant execute on function public.create_public_order(jsonb) to anon, authenticated;

grant select on public.daily_menus to anon, authenticated;
grant select on public.catalog_items to anon, authenticated;
grant insert on public.orders to anon, authenticated;
grant insert on public.contacts to anon, authenticated;
grant select, insert, update, delete on public.app_settings to authenticated;
grant select, insert, update, delete on public.daily_menus to authenticated;
grant select, insert, update, delete on public.catalog_items to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
grant select on public.customers, public.prospects to authenticated;


-- operations.sql
-- Operación transaccional. Aplicar después de schema.sql.
create table if not exists public.delivery_zones (
  id text primary key, name text not null unique, price integer check(price >= 0), active boolean not null default true
);
alter table public.delivery_zones enable row level security;
drop policy if exists "Read delivery zones" on public.delivery_zones;
create policy "Read delivery zones" on public.delivery_zones for select using(active or public.is_la_tuba_admin());
drop policy if exists "Manage delivery zones" on public.delivery_zones;
create policy "Manage delivery zones" on public.delivery_zones for all to authenticated using(public.is_la_tuba_admin()) with check(public.is_la_tuba_admin());
grant select on public.delivery_zones to anon, authenticated;
grant insert,update,delete on public.delivery_zones to authenticated;

create table if not exists public.submission_requests (
  request_id uuid primary key, kind text not null, fingerprint text not null, result_id uuid not null, created_at timestamptz not null default now()
);
alter table public.submission_requests enable row level security;
revoke all on public.submission_requests from public, anon, authenticated;

alter table public.contacts add column if not exists document_number text;
alter table public.contacts add column if not exists admin_note text;
alter table public.contacts add column if not exists tags text[] not null default '{}';
create or replace view public.customers with(security_invoker=true) as
select id,phone,name,email,birthday,addresses,order_count,total_spent,first_order_at,last_order_at,created_at,updated_at,document_number,admin_note,tags
from public.contacts where order_count > 0;

-- Cotización: ignora los importes y descuentos proporcionados por el navegador.
create or replace function public.quote_order(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item jsonb; product public.catalog_items%rowtype; menu public.daily_menus%rowtype;
  clean_items jsonb := '[]'; choices jsonb; unit_price integer; qty integer; subtotal integer:=0; shipping integer:=0;
  promo public.promotions%rowtype; eligible integer; eligible_qty integer; discount integer; best integer:=0; winning jsonb:='[]';
  canonical_product jsonb; special_name text;
begin
  if jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'Agrega productos válidos'; end if;
  if jsonb_array_length(payload->'items') not between 1 and 100 then raise exception 'El pedido debe tener entre 1 y 100 líneas'; end if;
  if coalesce(payload->>'servicio','') not in ('local','llevar','domicilio') then raise exception 'Servicio inválido'; end if;
  for item in select value from jsonb_array_elements(payload->'items') loop
    if coalesce(item->>'qty','') !~ '^[0-9]+$' then raise exception 'Cantidad inválida'; end if;
    qty := (item->>'qty')::integer;
    if qty not between 1 and 100 then raise exception 'Cantidad inválida'; end if;
    if coalesce(item->'extrasQty','{}') <> '{}'::jsonb or coalesce(item->'toppingIds','[]') <> '[]'::jsonb then raise exception 'Los adicionales anteriores ya no están disponibles'; end if;
    if item->'product'->>'dailyMenuId' is not null then
      select * into menu from public.daily_menus where id=(item->'product'->>'dailyMenuId')::uuid and active and scheduled_date=(now() at time zone 'America/Bogota')::date;
      if not found then raise exception 'El menú seleccionado ya no está disponible'; end if;
      choices := coalesce(item->'product'->'menuChoices','{}'); special_name := nullif(choices->>'special','');
      if special_name is not null then
        select (s->>'price')::integer into unit_price from jsonb_array_elements(menu.specials) s where s->>'name'=special_name;
        if unit_price is null or unit_price<=0 then raise exception 'Especial no disponible'; end if;
      else
        if not (public.is_avena_staff() and payload->>'canal'='admin') and ((jsonb_array_length(menu.soups)>0 and not menu.soups ? coalesce(choices->>'soup','')) or
          (jsonb_array_length(menu.sides)>0 and not menu.sides ? coalesce(choices->>'side','')) or
          (jsonb_array_length(menu.proteins)>0 and not menu.proteins ? coalesce(choices->>'protein',''))) then raise exception 'Revisa las opciones del menú diario'; end if;
        unit_price:=menu.price;
      end if;
      canonical_product := jsonb_build_object('id',menu.id,'dailyMenuId',menu.id,'menuChoices',choices,'category','frutafresh','categoryId','menu-del-dia','name',coalesce(special_name,menu.title),'description',concat_ws(' · ',nullif(choices->>'soup',''),nullif(choices->>'side',''),nullif(choices->>'protein','')),'prices',jsonb_build_object('fijo',unit_price),'toppingsIncludedMax',0,'image','/avena-cubana-logo.png');
    else
      select * into product from public.catalog_items where id=(item->'product'->>'id')::uuid and available and business='la_tuba';
      if not found then raise exception 'Un producto ya no está disponible; actualiza la carta'; end if;
      unit_price:=product.price;
      canonical_product:=jsonb_build_object('id',product.id,'name',product.name,'description',product.description,'category','frutafresh','categoryId',product.item_type||'-'||product.category,'itemType',product.item_type,'prices',jsonb_build_object('fijo',unit_price),'toppingsIncludedMax',0,'image',product.image_url);
    end if;
    if unit_price<=0 then raise exception 'Producto sin precio configurado'; end if;
    clean_items:=clean_items||jsonb_build_array(jsonb_build_object('id',coalesce(nullif(item->>'id',''),gen_random_uuid()::text),'product',canonical_product,'qty',qty,'note',left(coalesce(item->>'note',''),2000),'version',null,'size',null,'toppingIds','[]'::jsonb,'extrasQty','{}'::jsonb,'extraSelections','{}'::jsonb,'servido',false));
    subtotal:=subtotal+unit_price*qty;
  end loop;
  if payload->>'servicio'='domicilio' then
    select price into shipping from public.delivery_zones where active and (id=payload->'cliente'->>'barrioId' or name=payload->'cliente'->>'barrio') limit 1;
    if shipping is null then raise exception 'El barrio no tiene tarifa de domicilio; consulta con Avena Cubana Pop'; end if;
    if nullif(trim(payload->'cliente'->>'direccion'),'') is null then raise exception 'Indica la dirección de entrega'; end if;
  end if;
  for promo in select * from public.promotions where active order by id loop
    if (nullif(promo.data->>'fechaInicio','')::timestamptz>now()) or (nullif(promo.data->>'fechaFin','')::timestamptz<now()) then continue; end if;
    if nullif(trim(promo.data->>'codigo'),'') is not null and upper(trim(promo.data->>'codigo'))<>upper(trim(coalesce(payload->>'couponCode',''))) then continue; end if;
    if nullif(promo.data->>'usosMaximos','') is not null and coalesce((promo.data->>'usosActuales')::integer,0)>=(promo.data->>'usosMaximos')::integer then continue; end if;
    select coalesce(sum((i->'product'->'prices'->>'fijo')::integer*(i->>'qty')::integer),0),coalesce(sum((i->>'qty')::integer),0) into eligible,eligible_qty
      from jsonb_array_elements(clean_items) i where coalesce(jsonb_array_length(promo.data->'productosIds'),0)=0 or promo.data->'productosIds' ? (i->'product'->>'id');
    if eligible=0 or eligible_qty<coalesce((promo.data->>'cantidadMinima')::integer,0) then continue; end if;
    discount:=0;
    if promo.data->>'tipo'='porcentaje' then discount:=round(eligible*(promo.data->>'valor')::numeric/100)::integer;
    elsif promo.data->>'tipo'='valor_fijo' then discount:=(promo.data->>'valor')::integer;
    elsif promo.data->>'tipo'='2x1' then
      select coalesce(sum((i->'product'->'prices'->>'fijo')::integer*((i->>'qty')::integer/2)),0) into discount from jsonb_array_elements(clean_items) i
        where coalesce(jsonb_array_length(promo.data->'productosIds'),0)=0 or promo.data->'productosIds' ? (i->'product'->>'id');
    end if;
    discount:=greatest(0,least(discount,eligible));
    if discount>best then best:=discount; winning:=jsonb_build_array(jsonb_build_object('promoId',promo.id,'nombre',promo.data->>'nombre','tipo',promo.data->>'tipo','valor',(promo.data->>'valor')::numeric,'descuento',discount)); end if;
  end loop;
  return jsonb_build_object('items',clean_items,'subtotal',subtotal,'delivery',shipping,'descuentoTotal',best,'total',subtotal+shipping-best,'promociones',winning);
end $$;
revoke all on function public.quote_order(jsonb) from public;
grant execute on function public.quote_order(jsonb) to anon,authenticated;

create table if not exists public.order_inventory_allocations (
  order_id uuid references public.orders(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id), quantity numeric(14,3) not null check(quantity>0),
  primary key(order_id,inventory_item_id)
);
alter table public.order_inventory_allocations enable row level security;
revoke all on public.order_inventory_allocations from public,anon,authenticated;
create or replace function public.sync_order_inventory()
returns trigger language plpgsql security definer set search_path=public as $$
declare allocation record; needed record;
begin
  if tg_op='UPDATE' and new.items=old.items and (new.status='cancelado')=(old.status='cancelado') then return new; end if;
  perform pg_advisory_xact_lock(hashtext('la_tuba_inventory'));
  for allocation in select * from public.order_inventory_allocations where order_id=old.id order by inventory_item_id loop
    update public.inventory_items set quantity=quantity+allocation.quantity,updated_at=now() where id=allocation.inventory_item_id;
    insert into public.inventory_movements(inventory_item_id,quantity_change,reason,order_id) values(allocation.inventory_item_id,allocation.quantity,'Devolución por ajuste o cancelación',old.id);
  end loop;
  delete from public.order_inventory_allocations where order_id=old.id;
  if tg_op='DELETE' then return old; end if;
  if new.status='cancelado' then return new; end if;
  if exists (select 1 from jsonb_array_elements(new.items) i where not exists (select 1 from public.catalog_inventory_requirements r where r.catalog_item_id::text=i->'product'->>'id')) then raise exception 'Cada producto debe estar vinculado al inventario antes de venderse'; end if;
  for needed in select r.inventory_item_id,sum(r.quantity_required*(i->>'qty')::integer) quantity
    from jsonb_array_elements(new.items) i join public.catalog_inventory_requirements r on r.catalog_item_id::text=i->'product'->>'id'
    group by r.inventory_item_id order by r.inventory_item_id loop
    update public.inventory_items set quantity=quantity-needed.quantity,updated_at=now() where id=needed.inventory_item_id and quantity>=needed.quantity;
    if not found then raise exception 'No hay existencias suficientes. Actualiza tu pedido.'; end if;
    insert into public.order_inventory_allocations values(new.id,needed.inventory_item_id,needed.quantity);
    insert into public.inventory_movements(inventory_item_id,quantity_change,reason,order_id) values(needed.inventory_item_id,-needed.quantity,'Consumo de pedido',new.id);
  end loop;
  return new;
end $$;
drop trigger if exists order_inventory_write on public.orders;
create trigger order_inventory_write after insert or update of items,status on public.orders for each row execute function public.sync_order_inventory();
drop trigger if exists order_inventory_delete on public.orders;
create trigger order_inventory_delete before delete on public.orders for each row execute function public.sync_order_inventory();

alter table public.orders add column if not exists paid_total integer not null default 0;
create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete restrict,
  amount integer not null check(amount<>0), method text not null check(method in ('Efectivo','Transferencia')),
  request_id uuid not null unique, note text, created_at timestamptz not null default now(), created_by uuid default auth.uid()
);
alter table public.order_payments enable row level security;
revoke all on public.order_payments from public,anon,authenticated;
grant select on public.order_payments to authenticated;
drop policy if exists "Admins read payments" on public.order_payments;
create policy "Admins read payments" on public.order_payments for select to authenticated using(public.is_la_tuba_admin());
create or replace function public.record_order_payment(p_order_id uuid,p_amount integer,p_method text,p_request_id uuid,p_note text default '')
returns uuid language plpgsql security definer set search_path=public as $$
declare ord public.orders%rowtype; existing public.order_payments%rowtype; result uuid;
begin
  if not public.is_avena_staff() then raise exception 'Acceso denegado'; end if;
  if p_amount < 0 and not public.is_la_tuba_admin() then raise exception 'Solo el administrador puede registrar devoluciones'; end if;
  perform pg_advisory_xact_lock(hashtext(p_request_id::text));
  select * into existing from public.order_payments where request_id=p_request_id;
  if found then
    if existing.order_id<>p_order_id or existing.amount<>p_amount or existing.method<>p_method then raise exception 'Solicitud de cobro reutilizada con datos distintos'; end if;
    return existing.id;
  end if;
  select * into ord from public.orders where id=p_order_id and business='la_tuba' for update;
  if not found or p_amount is null or p_amount=0 or ord.paid_total+p_amount<0 or ord.paid_total+p_amount>ord.total or (ord.status='cancelado' and p_amount>0) then raise exception 'Importe de cobro o devolución inválido'; end if;
  insert into public.order_payments(order_id,amount,method,request_id,note) values(p_order_id,p_amount,p_method,p_request_id,p_note) returning id into result;
  update public.orders set paid_total=paid_total+p_amount,updated_at=now() where id=p_order_id;
  return result;
end $$;
revoke all on function public.record_order_payment(uuid,integer,text,uuid,text) from public;
grant execute on function public.record_order_payment(uuid,integer,text,uuid,text) to authenticated;

-- schema.sql vuelve a crear la rutina base; conservarla sin acceso público.
drop function if exists public.create_order_record(jsonb);
alter function public.create_public_order(jsonb) rename to create_order_record;
revoke all on function public.create_order_record(jsonb) from public,anon,authenticated;
create or replace function public.create_public_order(payload jsonb)
returns table(id uuid,order_number text) language plpgsql security definer set search_path=public as $$
declare key uuid; request public.submission_requests%rowtype; hash text; quote jsonb; result record; promo jsonb; admin_sale boolean;
begin
  key:=(payload->>'requestId')::uuid;
  if key is null then raise exception 'Actualiza la página para confirmar el pedido'; end if;
  hash:=md5((payload-'numeroOrden'-'requestId'-'trackingToken')::text);
  perform pg_advisory_xact_lock(hashtext(key::text));
  select * into request from public.submission_requests where request_id=key;
  if found then
    if request.kind<>'order' or request.fingerprint<>hash then raise exception 'La solicitud ya fue utilizada con otros datos'; end if;
    return query select o.id,o.order_number from public.orders o where o.id=request.result_id; return;
  end if;
  -- Serializa consumo de cupos de promoción; el inventario además usa escrituras atómicas.
  perform pg_advisory_xact_lock(hashtext('la_tuba_promotions'));
  perform p.id from public.promotions p where p.active order by p.id for update;
  quote:=public.quote_order(payload);
  if (payload->>'total')::integer is distinct from (quote->>'total')::integer or (payload->>'subtotal')::integer is distinct from (quote->>'subtotal')::integer or (payload->>'delivery')::integer is distinct from (quote->>'delivery')::integer then
    raise exception 'Los precios o promociones cambiaron. Actualiza el resumen antes de confirmar.';
  end if;
  admin_sale:=public.is_avena_staff() and payload->>'canal'='admin';
  select * into result from public.create_order_record(payload||quote);
  insert into public.submission_requests values(key,'order',hash,result.id,now());
  if payload->>'servicio'='domicilio' and payload->>'trackingToken' is not null then
    insert into public.order_tracking_tokens(order_id,token) values(result.id,(payload->>'trackingToken')::uuid);
  end if;
  for promo in select value from jsonb_array_elements(quote->'promociones') loop
    update public.promotions set data=jsonb_set(data,'{usosActuales}',to_jsonb(coalesce((data->>'usosActuales')::integer,0)+1)),updated_at=now() where public.promotions.id=(promo->>'promoId')::uuid;
  end loop;
  if admin_sale and payload->>'estado'='pagado' then perform public.record_order_payment(result.id,(quote->>'total')::integer,payload->>'formaPago',key,'Venta en caja'); end if;
  return query select result.id::uuid,result.order_number::text;
end $$;
revoke all on function public.create_public_order(jsonb) from public;
grant execute on function public.create_public_order(jsonb) to anon,authenticated;

-- Capacidad de edición de ubicación limitada a un pedido, por token aleatorio.
create table if not exists public.order_tracking_tokens(order_id uuid primary key references public.orders(id) on delete cascade,token uuid not null,expires_at timestamptz not null default now()+interval '8 hours');
alter table public.order_tracking_tokens enable row level security;
revoke all on public.order_tracking_tokens from public,anon,authenticated;
create or replace function public.update_order_location(p_order_id uuid,p_token uuid,p_lat double precision,p_lng double precision)
returns void language plpgsql security definer set search_path=public as $$
declare loc jsonb;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Ubicación inválida'; end if;
  if not exists(select 1 from public.order_tracking_tokens where order_id=p_order_id and token=p_token and expires_at>now()) then raise exception 'Acceso de ubicación vencido'; end if;
  loc:=jsonb_build_object('lat',p_lat,'lng',p_lng,'timestamp',floor(extract(epoch from now())*1000));
  update public.orders set customer=jsonb_set(customer,'{coordenadas}',loc),location=loc,updated_at=now() where id=p_order_id and service='domicilio' and status not in ('cancelado','entregado');
end $$;
revoke all on function public.update_order_location(uuid,uuid,double precision,double precision) from public;
grant execute on function public.update_order_location(uuid,uuid,double precision,double precision) to anon,authenticated;

drop function if exists public.create_reservation_record(jsonb);
alter function public.create_reservation_request(jsonb) rename to create_reservation_record;
revoke all on function public.create_reservation_record(jsonb) from public,anon,authenticated;
create or replace function public.create_reservation_request(payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare key uuid; request public.submission_requests%rowtype; hash text; result uuid;
begin
  key:=(payload->>'requestId')::uuid; if key is null then raise exception 'Actualiza la página para reservar'; end if;
  hash:=md5((payload-'requestId')::text);
  perform pg_advisory_xact_lock(hashtext(key::text));
  select * into request from public.submission_requests where request_id=key;
  if found then
    if request.kind<>'reservation' or request.fingerprint<>hash then raise exception 'Solicitud reutilizada con otros datos'; end if;
    return request.result_id;
  end if;
  result:=public.create_reservation_record(payload);
  insert into public.submission_requests values(key,'reservation',hash,result,now());
  return result;
end $$;
revoke all on function public.create_reservation_request(jsonb) from public;
grant execute on function public.create_reservation_request(jsonb) to anon,authenticated;

create or replace function public.merge_contacts(p_keep_phone text,p_merge_phone text)
returns void language plpgsql security definer set search_path=public as $$
declare kept public.contacts%rowtype; merged public.contacts%rowtype;
begin
  if not public.is_la_tuba_admin() then raise exception 'Acceso denegado'; end if;
  perform pg_advisory_xact_lock(hashtext('la_tuba_contacts_merge'));
  select * into kept from public.contacts where phone=public.existing_contact_phone(p_keep_phone) for update;
  select * into merged from public.contacts where phone=public.existing_contact_phone(p_merge_phone) for update;
  if kept.id is null or merged.id is null or kept.id=merged.id then raise exception 'Selecciona dos contactos distintos'; end if;
  update public.contacts set email=coalesce(kept.email,merged.email),birthday=coalesce(kept.birthday,merged.birthday),addresses=kept.addresses||merged.addresses,
    document_number=coalesce(kept.document_number,merged.document_number),admin_note=concat_ws(E'\n',kept.admin_note,merged.admin_note),tags=array(select distinct unnest(kept.tags||merged.tags)) where id=kept.id;
  update public.orders set customer_id=kept.id where customer_id=merged.id;
  update public.reservations set contact_id=kept.id where contact_id=merged.id;
  delete from public.contacts where id=merged.id;
  perform public.refresh_contact_purchase_stats(kept.id);
end $$;
revoke all on function public.merge_contacts(text,text) from public;
grant execute on function public.merge_contacts(text,text) to authenticated;
revoke all on function public.refresh_contact_purchase_stats(uuid) from public,anon,authenticated;
revoke update on public.orders from authenticated;
grant update(customer,items,subtotal,delivery,total,service,payment_method,status,comments,location,promotions,discount_total,updated_at,admin_note,payment_details,delivery_amount,business_amount,status_history) on public.orders to authenticated;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title))>0), description text not null default '',
  starts_at timestamptz not null, image_url text, published boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 2 and 100),
  rating integer not null check(rating between 1 and 5), comment text not null check(length(trim(comment)) between 5 and 2000),
  approved boolean not null default false, request_id uuid not null unique, created_at timestamptz not null default now()
);
alter table public.events enable row level security;
alter table public.reviews enable row level security;
drop policy if exists "Read events" on public.events;
create policy "Read events" on public.events for select using(published or public.is_la_tuba_admin());
drop policy if exists "Admin events" on public.events;
create policy "Admin events" on public.events for all to authenticated using(public.is_la_tuba_admin()) with check(public.is_la_tuba_admin());
drop policy if exists "Read reviews" on public.reviews;
create policy "Read reviews" on public.reviews for select using(approved or public.is_la_tuba_admin());
drop policy if exists "Admin reviews" on public.reviews;
create policy "Admin reviews" on public.reviews for all to authenticated using(public.is_la_tuba_admin()) with check(public.is_la_tuba_admin());
grant select on public.events,public.reviews to anon,authenticated;
grant insert,update,delete on public.events,public.reviews to authenticated;
create or replace function public.submit_review(p_name text,p_rating integer,p_comment text,p_request_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
  insert into public.reviews(name,rating,comment,request_id) values(trim(p_name),p_rating,trim(p_comment),p_request_id)
    on conflict(request_id) do nothing returning id into result;
  if result is null then select id into result from public.reviews where request_id=p_request_id; end if;
  return result;
end $$;
revoke all on function public.submit_review(text,integer,text,uuid) from public;
grant execute on function public.submit_review(text,integer,text,uuid) to anon,authenticated;


-- migrations/20261111_pay_later.sql
-- El cobro posterior actualiza saldo y estado en la misma transacción.
create or replace function public.record_order_payment(p_order_id uuid,p_amount integer,p_method text,p_request_id uuid,p_note text default '')
returns uuid language plpgsql security definer set search_path=public as $$
declare ord public.orders%rowtype; existing public.order_payments%rowtype; result uuid; next_paid integer;
begin
  if not public.is_avena_staff() then raise exception 'Acceso denegado'; end if;
  if p_amount < 0 and not public.is_la_tuba_admin() then raise exception 'Solo el administrador puede registrar devoluciones'; end if;
  perform pg_advisory_xact_lock(hashtext(p_request_id::text));
  select * into existing from public.order_payments where request_id=p_request_id;
  if found then
    if existing.order_id<>p_order_id or existing.amount<>p_amount or existing.method<>p_method then raise exception 'Solicitud de cobro reutilizada con datos distintos'; end if;
    return existing.id;
  end if;
  select * into ord from public.orders where id=p_order_id and business='la_tuba' for update;
  if not found or p_amount is null or p_amount=0 or ord.paid_total+p_amount<0 or ord.paid_total+p_amount>ord.total or (ord.status='cancelado' and p_amount>0) then raise exception 'Importe de cobro o devolución inválido'; end if;
  insert into public.order_payments(order_id,amount,method,request_id,note) values(p_order_id,p_amount,p_method,p_request_id,p_note) returning id into result;
  next_paid:=ord.paid_total+p_amount;
  update public.orders set
    paid_total=next_paid,
    payment_method=case when p_amount>0 then p_method else payment_method end,
    status=case
      when status='no_pagado' and next_paid=total then 'pagado'
      when status='pagado' and next_paid<total then 'no_pagado'
      else status
    end,
    updated_at=now()
  where id=p_order_id;
  return result;
end $$;
revoke all on function public.record_order_payment(uuid,integer,text,uuid,text) from public;
grant execute on function public.record_order_payment(uuid,integer,text,uuid,text) to authenticated;


-- migrations/20261111_order_total_guard.sql
-- Una edición no puede dejar el saldo cobrado por encima del nuevo total.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_paid_total_within_total' and conrelid = 'public.orders'::regclass) then
    alter table public.orders add constraint orders_paid_total_within_total check (paid_total >= 0 and paid_total <= total) not valid;
  end if;
end $$;
alter table public.orders validate constraint orders_paid_total_within_total;


-- migrations/20261114_catalog_images.sql
-- Fotos públicas del catálogo; solo administradores de Avena Cubana Pop pueden modificarlas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avena-cubana-catalog-images', 'avena-cubana-catalog-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "Avena Cubana Pop admins upload catalog images" on storage.objects;
create policy "Avena Cubana Pop admins upload catalog images" on storage.objects
for insert to authenticated with check (bucket_id = 'avena-cubana-catalog-images' and public.is_la_tuba_admin());
drop policy if exists "Avena Cubana Pop admins remove catalog images" on storage.objects;
create policy "Avena Cubana Pop admins remove catalog images" on storage.objects
for delete to authenticated using (bucket_id = 'avena-cubana-catalog-images' and public.is_la_tuba_admin());


-- migrations/20261114_admin_statistics.sql
-- Estadísticas agregadas en servidor, accesibles únicamente a administradores.
create or replace function public.la_tuba_statistics(p_from date, p_until date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.is_la_tuba_admin() then raise exception 'Acceso denegado'; end if;
  if p_from is null or p_until is null or p_from >= p_until or p_until - p_from > 3660 then raise exception 'Periodo inválido'; end if;
  with selected as (
    select * from public.orders where business='la_tuba'
      and created_at >= (p_from::timestamp at time zone 'America/Bogota')
      and created_at < (p_until::timestamp at time zone 'America/Bogota')
  ), payments as (
    select p.amount,p.method from public.order_payments p join public.orders o on o.id=p.order_id
    where o.business='la_tuba' and p.created_at >= (p_from::timestamp at time zone 'America/Bogota')
      and p.created_at < (p_until::timestamp at time zone 'America/Bogota')
  ), products as (
    select coalesce(nullif(trim(i->'product'->>'name'),''),'Producto') name,
      sum(case when coalesce(i->>'qty','') ~ '^[0-9]+$' then (i->>'qty')::integer else 0 end)::bigint quantity
    from selected o cross join lateral jsonb_array_elements(o.items) i
    where o.status <> 'cancelado' group by 1 order by quantity desc, name limit 8
  )
  select jsonb_build_object(
    'orders', (select count(*) from selected),
    'active_orders', (select count(*) from selected where status <> 'cancelado'),
    'cancelled', (select count(*) from selected where status = 'cancelado'),
    'order_total', (select coalesce(sum(total),0) from selected where status <> 'cancelado'),
    'outstanding', (select coalesce(sum(greatest(total-paid_total,0)),0) from selected where status <> 'cancelado'),
    'collected', (select coalesce(sum(amount) filter(where amount>0),0) from payments),
    'refunded', (select coalesce(-sum(amount) filter(where amount<0),0) from payments),
    'cash', (select coalesce(sum(amount) filter(where method='Efectivo'),0) from payments),
    'transfer', (select coalesce(sum(amount) filter(where method='Transferencia'),0) from payments),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('name',service,'count',n) order by n desc),'[]'::jsonb) from (select service,count(*) n from selected where status <> 'cancelado' group by service) s),
    'products', (select coalesce(jsonb_agg(jsonb_build_object('name',name,'quantity',quantity) order by quantity desc,name),'[]'::jsonb) from products),
    'customers', (select count(*) from public.customers),
    'prospects', (select count(*) from public.prospects),
    'reservations', (select count(*) from public.reservations where created_at >= (p_from::timestamp at time zone 'America/Bogota') and created_at < (p_until::timestamp at time zone 'America/Bogota'))
  ) into result;
  return result;
end $$;
revoke all on function public.la_tuba_statistics(date,date) from public, anon;
grant execute on function public.la_tuba_statistics(date,date) to authenticated;


-- migrations/20261114_realtime_notifications.sql
-- Los eventos respetan las políticas de acceso existentes de cada tabla.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
      alter publication supabase_realtime add table public.orders;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservations') then
      alter publication supabase_realtime add table public.reservations;
    end if;
  end if;
end $$;


-- seed_avena_inventario.sql
-- Carga inicial: IDs UUID nuevos; no modifica existencias ya existentes.
-- Las cantidades son una instantánea proporcionada por el negocio.
insert into public.admin_emails(email) values ('avenacubanapop@gmail.com') on conflict do nothing;
with source(name,quantity,minimum_quantity,unit) as (values
  ('Sevillana vaso 9 oz',179,14,'VASO'),
  ('Sevillana 1Lt',7,10,'LITRO'),
  ('Sevillana 2 Lt',10,5,'2 LITROS'),
  ('Avena Cubana 1 Lt',19,10,'LITRO'),
  ('Avena Cubana 2 Lt',0,5,'2 LITROS'),
  ('Yogurt Fresa vaso 9oz',0,15,'VASO'),
  ('Yogurt Fresa 1 Lt',0,10,'LITRO'),
  ('Yogurt Fresa 2 Lt',0,5,'2 LITROS'),
  ('Kumis vaso 9oz',26,15,'VASO'),
  ('Kumis 1 Lt',20,10,'LITRO'),
  ('Kumis 2 Lt',0,5,'2 LITROS'),
  ('Cucas 1 unidad',241,30,'UNIDAD'),
  ('Cucas paquete x 10',0,3,'PAQUETE'),
  ('Mantecadas por unidad',0,30,'UNIDAD'),
  ('Almojábanas por unidad',20,30,'UNIDAD'),
  ('Kumis vaso 12oz',0,15,'VASO'),
  ('Sevillana Galón',0,5,'GALÓN'),
  ('Avena Galón',0,5,'GALÓN'),
  ('Kumis Galón',0,5,'GALÓN'),
  ('Yogurt Fresa vaso 12oz',0,15,'VASO'),
  ('Yogurt Melocotón vaso 9oz',0,15,'VASO'),
  ('Yogurt Melocotón vaso 12oz',0,15,'VASO'),
  ('Yogurt Maracumango 9oz',42,15,'VASO'),
  ('Yogurt Maracumango 12oz',0,15,'VASO'),
  ('Yogurt Melocotón 1lt',0,10,'LITRO'),
  ('Yogurt Melocotón 2lt',0,5,'2 LITROS'),
  ('Yogurt Maracumango 2lt',0,5,'2 LITROS'),
  ('Avena Cubana Vaso 10oz',136,15,'VASO'),
  ('Sevillana Vaso 10oz',0,15,'VASO'),
  ('Kumis Vaso 10 oz',0,15,'VASO'),
  ('Yogurt Maracumango 10 oz',0,15,'VASO'),
  ('Yogurt Fresa Vaso 10 oz',0,15,'VASO'),
  ('Yogurt Frutos Rojos 10 oz',0,15,'LITRO'),
  ('Yogurt Mora',0,15,'LITRO'),
  ('Pastel de Pollo Und',20,15,'UNIDAD'),
  ('Yogurt de Maracumango',0,5,'LITRO'),
  ('YOGURT DE MARACUMANGO',5,5,'GALÓN')
), inserted as (
  insert into public.inventory_items(name, quantity, minimum_quantity, unit)
  select s.name,s.quantity,s.minimum_quantity,s.unit from source s
  where not exists (select 1 from public.inventory_items i where lower(i.name)=lower(s.name) and lower(i.unit)=lower(s.unit))
  returning id, quantity
)
insert into public.inventory_movements(inventory_item_id,quantity_change,reason)
select id,quantity,'Carga inicial de Avena Cubana Pop' from inserted where quantity > 0;


COMMIT;

create or replace function public.avena_staff_role() returns text
language sql stable security definer set search_path=public as $$
 select role from public.staff_accounts where auth.uid() is not null and active and email=lower(auth.jwt()->>'email')
$$;
revoke all on function public.avena_staff_role() from public;
grant execute on function public.avena_staff_role() to authenticated;
drop policy if exists "Caja consulta pedidos" on public.orders;
create policy "Caja consulta pedidos" on public.orders for select to authenticated
using (business='la_tuba' and public.avena_staff_role()='caja');
drop policy if exists "Caja consulta cobros" on public.order_payments;
create policy "Caja consulta cobros" on public.order_payments for select to authenticated
using (public.avena_staff_role()='caja' and exists(select 1 from public.orders o where o.id=order_id and o.business='la_tuba'));

create or replace function public.create_inventory_item(p_name text,p_unit text,p_minimum numeric,p_initial numeric)
returns uuid language plpgsql security definer set search_path=public as $$
declare item_id uuid;
begin
 if not public.is_avena_staff() then raise exception 'Acceso denegado'; end if;
 if nullif(trim(p_name),'') is null or nullif(trim(p_unit),'') is null or p_initial is null or p_initial<0 or p_minimum is null or p_minimum<0 then raise exception 'Revisa los datos del producto'; end if;
 insert into public.inventory_items(name,unit,quantity,minimum_quantity) values(trim(p_name),trim(p_unit),p_initial,p_minimum) returning id into item_id;
 if p_initial>0 then insert into public.inventory_movements(inventory_item_id,quantity_change,reason) values(item_id,p_initial,'Existencia inicial'); end if;
 return item_id;
end $$;

alter table public.inventory_movements add column if not exists actor_email text;
update public.inventory_movements m set actor_email=u.email from auth.users u where m.created_by=u.id and m.actor_email is null;
create or replace function public.stamp_inventory_actor() returns trigger language plpgsql set search_path=public as $$
begin
 new.actor_email:=case when auth.uid() is not null then auth.jwt()->>'email' end;
 return new;
end $$;
drop trigger if exists inventory_actor on public.inventory_movements;
create trigger inventory_actor before insert on public.inventory_movements for each row execute function public.stamp_inventory_actor();

create table if not exists public.order_activity (
 id bigint generated always as identity primary key, order_id uuid not null references public.orders(id) on delete cascade,
 event text not null, actor text not null, created_at timestamptz not null default now()
);
create index if not exists order_activity_order_idx on public.order_activity(order_id,id);
alter table public.order_activity enable row level security;
revoke all on public.order_activity from public,anon,authenticated;
grant select on public.order_activity to authenticated;
drop policy if exists "Consultar historial de pedidos" on public.order_activity;
create policy "Consultar historial de pedidos" on public.order_activity for select to authenticated
using (public.is_la_tuba_admin() or public.avena_staff_role()='caja');
create or replace function public.record_avena_activity() returns trigger language plpgsql security definer set search_path=public as $$
declare action text; who text := coalesce(auth.jwt()->>'email','Sistema');
begin
 if new.business <> 'la_tuba' then return new; end if;
 if tg_op='INSERT' then
   action:='Pedido creado';
   if new.channel='web' then who:=coalesce(nullif(new.customer->>'nombres',''),'Cliente') || ' (web)'; end if;
 elsif new.paid_total is distinct from old.paid_total then action:=case when new.paid_total>old.paid_total then 'Cobro registrado' else 'Devolución registrada' end;
 elsif new.status is distinct from old.status then action:='Estado actualizado: ' || replace(new.status,'_',' ');
 elsif new.items is distinct from old.items then action:='Productos del pedido actualizados';
 elsif (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then action:='Datos del pedido actualizados';
 else return new;
 end if;
 insert into public.order_activity(order_id,event,actor) values(new.id,action,who);
 return new;
end $$;
revoke all on function public.record_avena_activity() from public;
drop trigger if exists record_avena_activity on public.orders;
create trigger record_avena_activity after insert or update on public.orders for each row execute function public.record_avena_activity();

create or replace function public.create_staff_login(p_email text, p_password text, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  address text := lower(trim(p_email));
  account_id uuid := gen_random_uuid();
begin
  if not coalesce(public.is_la_tuba_admin(), false) then
    raise exception 'Solo el administrador puede crear usuarios';
  end if;
  if address is null or length(address)>254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_role is null or p_role not in ('caja','manana','tarde') then
    raise exception 'Revisa el correo y el turno';
  end if;
  if p_password is null or length(p_password)<8 or octet_length(p_password)>72 then
    raise exception 'Usa una contraseña de al menos 8 caracteres y hasta 72 bytes';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(address, 0));
  if exists(select 1 from auth.users where lower(email)=address)
     or exists(select 1 from public.admin_emails where lower(email)=address) then
    raise exception 'Este correo ya tiene una cuenta. Usa otro correo para crear un usuario.';
  end if;
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    confirmation_token,recovery_token,email_change_token_new,email_change,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values ('00000000-0000-0000-0000-000000000000',account_id,'authenticated','authenticated',address,
    extensions.crypt(p_password,extensions.gen_salt('bf',10)),now(),'','','','',
    '{"provider":"email","providers":["email"]}',jsonb_build_object('email_verified',true),now(),now());
  insert into auth.identities(user_id,provider_id,provider,identity_data,created_at,updated_at)
  values(account_id,account_id::text,'email',jsonb_build_object('sub',account_id::text,'email',address,'email_verified',true),now(),now());
  insert into public.staff_accounts(email,role,active) values(address,p_role,true)
    on conflict(email) do update set role=excluded.role,active=true;
end $$;
revoke all on function public.create_staff_login(text,text,text) from public,anon;
grant execute on function public.create_staff_login(text,text,text) to authenticated;

drop policy if exists "Turnos consultan mesas" on public.orders;
create policy "Turnos consultan mesas" on public.orders for select to authenticated
using (business='la_tuba' and service='local' and public.avena_staff_role() in ('manana','tarde'));

create or replace function public.list_staff_accounts() returns table(email text,role text,active boolean,account_exists boolean)
language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_la_tuba_admin(),false) then raise exception 'Acceso denegado'; end if;
 return query select s.email,s.role,s.active,exists(select 1 from auth.users u where lower(u.email)=s.email and u.deleted_at is null) from public.staff_accounts s order by s.email;
end $$;
create or replace function public.reset_staff_password(p_email text,p_password text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_la_tuba_admin(),false) then raise exception 'Acceso denegado'; end if;
 if p_password is null or length(p_password)<8 or octet_length(p_password)>72 then raise exception 'La contraseña debe tener al menos 8 caracteres y máximo 72 bytes'; end if;
 if not exists(select 1 from public.staff_accounts s where s.email=lower(trim(p_email)) and s.active) or exists(select 1 from public.admin_emails a where lower(a.email)=lower(trim(p_email))) then raise exception 'Usuario de personal activo no encontrado'; end if;
 update auth.users set encrypted_password=extensions.crypt(p_password,extensions.gen_salt('bf',10)),updated_at=now() where lower(email)=lower(trim(p_email)) and deleted_at is null;
 if not found then raise exception 'La cuenta aún no ha sido creada'; end if;
end $$;
revoke all on function public.list_staff_accounts() from public,anon;
revoke all on function public.reset_staff_password(text,text) from public,anon;
grant execute on function public.list_staff_accounts(),public.reset_staff_password(text,text) to authenticated;

create or replace function public.staff_greeting() returns table(role text, number bigint)
language sql stable security definer set search_path='' as $$
 select ranked.role, ranked.number from (
   select s.email,s.role,row_number() over (partition by s.role order by s.email) as number
   from public.staff_accounts s where s.active
 ) ranked where ranked.email=lower(auth.jwt()->>'email') and auth.uid() is not null
$$;
revoke all on function public.staff_greeting() from public,anon;
grant execute on function public.staff_greeting() to authenticated;

insert into public.delivery_zones (id, name, price, active) values
  ('aida-lucia', 'Aida Lucia', 7000, true),
  ('alcala', 'Alcala', 6000, true),
  ('alfonso-lopez', 'Alfonso López', 5000, true),
  ('alicante', 'Alicante', 7000, true),
  ('antiguo-liceo', 'Antiguo Liceo', 5000, true),
  ('antonio-narino', 'Antonio Nariño', 6000, true),
  ('arrayanes-hacienda', 'Arrayanes de la Hacienda', 7000, true),
  ('barrio-bolivar', 'Barrio Bolivar', 5000, true),
  ('barrio-caldas', 'Barrio Caldas', 5000, true),
  ('batallon-jose-hilario-lopez', 'Batallón José Hilario Lopez', 7000, true),
  ('bello-horizonte', 'Bello Horizonte', 10000, true),
  ('belmonte', 'Belmonte', 7000, true),
  ('berlin', 'Berlín', 5000, true),
  ('boulevar-rose', 'Boulevar Rose', 6000, true),
  ('brisas-ladera', 'Brisas de la Ladera', 4000, true),
  ('cadillal', 'Cadillal', 5000, true),
  ('calatrava', 'Calatrava', 7000, true),
  ('calicanto', 'Calicanto', 5000, true),
  ('camilo-torres', 'Camilo Torres', 5000, true),
  ('camino-viejo', 'Camino Viejo', 8000, true),
  ('campamento', 'Campamento', 7000, true),
  ('campanario', 'Campanario', 6000, true),
  ('campo-bello', 'Campo Bello', 7000, true),
  ('campo-real', 'Campo Real', 7000, true),
  ('centro', 'Centro', 5000, true),
  ('chapinero', 'Chapinero', 7000, true),
  ('ciudad-2000', 'Ciudad 2000', 7000, true),
  ('ciudad-jardin', 'Ciudad Jardin', 6000, true),
  ('clinica-estancia', 'Clínica La Estancia', 6000, true),
  ('clinica-san-rafael', 'Clínica San Rafael', 6000, true),
  ('colinas-calicanto', 'Colinas de Calicanto', 5000, true),
  ('complejo-deportivo', 'Complejo Deportivo', 12000, true),
  ('comuneros', 'Comuneros', 4000, true),
  ('conjunto-ciudad-blanca', 'Conjunto Ciudad Blanca por Terraplaza', 13000, true),
  ('conjunto-luna-blanca', 'Conjunto Luna Blanca más arriba de Terraplaza', 13000, true),
  ('conjunto-antigua', 'Conjunto Residencial Antigua', 8000, true),
  ('dean-alto', 'Dean Alto', 4000, true),
  ('dean-bajo', 'Dean Bajo', 4000, true),
  ('el-boqueron', 'El Boquerón', 7000, true),
  ('el-cortijo', 'El Cortijo', 4000, true),
  ('el-empedrado', 'El Empedrado', 5000, true),
  ('el-lago', 'El Lago', 5000, true),
  ('el-limonar', 'El Limonar', 4000, true),
  ('el-mirador', 'El Mirador', 5000, true),
  ('el-obando', 'El Obando', 5000, true),
  ('el-placer', 'El Placer', 13000, true),
  ('el-suizo', 'El Suizo', 5000, true),
  ('el-uvo', 'El Uvo', 11000, true),
  ('exito-panamericana', 'Éxito Panamericana', 6000, true),
  ('germania', 'Germania', 6000, true),
  ('guayabal', 'Guayabal', 5000, true),
  ('guayacanes-rio', 'Guayacanes del Río', 10000, true),
  ('hospital-san-jose', 'Hospital San José', 6000, true),
  ('hospital-susana-lopez', 'Hospital Susana López de Valencia', 5000, true),
  ('jorge-eliecer-gaitan', 'Jorge Eliecer Gaitán', 5000, true),
  ('jose-hilario-lopez', 'José Hilario López', 4000, true),
  ('junin', 'Junín', 6000, true),
  ('la-alameda', 'La Alameda', 5000, true),
  ('la-colina', 'La Colina', 7000, true),
  ('la-esmeralda', 'La Esmeralda', 5000, true),
  ('la-estancia', 'La Estancia', 6000, true),
  ('la-floresta-norte', 'La Floresta Norte', 7000, true),
  ('la-gran-victoria', 'La Gran Victoria', 4000, true),
  ('la-heroica', 'La Heroica', 6000, true),
  ('la-ladera', 'La Ladera', 5000, true),
  ('la-pamba', 'La Pamba', 5000, true),
  ('la-sombrilla', 'La Sombrilla', 7000, true),
  ('la-vinera', 'La Vinera', 5000, true),
  ('la-ximena', 'La Ximena', 7000, true),
  ('las-americas', 'Las Américas', 4000, true),
  ('las-ferias', 'Las Ferias', 5000, true),
  ('las-garzas', 'Las Garzas', 8000, true),
  ('las-palmas', 'Las Palmas', 8000, true),
  ('las-veraneras', 'Las Veraneras', 5000, true),
  ('libertador', 'Libertador', 5000, true),
  ('loma-cartagena', 'Loma de Cartagena', 5000, true),
  ('loma-virgen', 'Loma de la Virgen', 5000, true),
  ('lomas-granada', 'Lomas de Granada', 8000, true),
  ('los-andes', 'Los Andes', 5000, true),
  ('los-angeles', 'Los Ángeles', 10000, true),
  ('los-braceros', 'Los Braceros', 6000, true),
  ('los-campos', 'Los Campos', 6000, true),
  ('los-sauces', 'Los Sauces', 5000, true),
  ('los-tejares', 'Los Tejares', 5000, true),
  ('madres-solteras', 'Madres Solteras', 5000, true),
  ('maria-occidente', 'María Occidente', 7000, true),
  ('modelo', 'Modelo', 5000, true),
  ('moscopan', 'Moscopan', 5000, true),
  ('nueva-granada', 'Nueva Granada', 4000, true),
  ('nuevo-japon', 'Nuevo Japón', 4000, true),
  ('padros-norte', 'Padros del Norte', 6000, true),
  ('pajonal', 'Pajonal', 4000, true),
  ('palace', 'Palace', 7000, true),
  ('palmares-sur', 'Palmares del Sur', 5000, true),
  ('panamericano', 'Panamericano', 6000, true),
  ('pandiguando', 'Pandiguando', 5000, true),
  ('pinar-vega', 'Pinar de la Vega', 8000, true),
  ('pisoje', 'Pisoje', 10000, true),
  ('plateado', 'Plateado', 5000, true),
  ('pomona', 'Pomona', 7000, true),
  ('pontevedra', 'Pontevedra', 7000, true),
  ('portal-ferias', 'Portal de las Ferias', 5000, true),
  ('portales-macizo', 'Portales de Macizo', 5000, true),
  ('portales-norte', 'Portales del Norte', 7000, true),
  ('portales-rio', 'Portales del Río', 7000, true),
  ('primero-mayo', 'Primero de Mayo', 4000, true),
  ('puelenje', 'Puelenje', 7000, true),
  ('recuerdo-norte', 'Recuerdo Norte', 6000, true),
  ('recuerdo-sur', 'Recuerdo Sur', 5000, true),
  ('retiro-alto', 'Retiro Alto', 5000, true),
  ('retiro-bajo', 'Retiro Bajo', 5000, true),
  ('san-andres', 'San Andrés', 5000, true),
  ('san-camilo', 'San Camilo', 4000, true),
  ('san-eduardo', 'San Eduardo', 12000, true),
  ('san-jose', 'San José', 6000, true),
  ('san-jose-tejares', 'San José de los Tejares', 5000, true),
  ('san-rafael', 'San Rafael', 4000, true),
  ('santa-catalina', 'Santa Catalina', 5000, true),
  ('santa-clara', 'Santa Clara', 5000, true),
  ('santa-helena', 'Santa Helena', 5000, true),
  ('santa-ines', 'Santa Inés', 5000, true),
  ('santa-monica', 'Santa Monica', 5000, true),
  ('santa-teresa', 'Santa Teresa', 4000, true),
  ('santafe', 'Santafé', 5000, true),
  ('sindical', 'Sindical', 4000, true),
  ('solidaridad', 'Solidaridad', 6000, true),
  ('terminal', 'Terminal', 6000, true),
  ('tomas-cipriano', 'Tomás Cipriano', 5000, true),
  ('urbanizacion-alcala', 'Urbanización Alcalá', 6000, true),
  ('urbanizacion-caldas', 'Urbanización Caldas', 5000, true),
  ('urbanizacion-playa', 'Urbanización La Playa', 7000, true),
  ('urbanizacion-ferias', 'Urbanización Las Ferias', 5000, true),
  ('urbanizacion-villa-alicia', 'Urbanización Villa Alicia', 7000, true),
  ('valencia', 'Valencia', 5000, true),
  ('valparaiso', 'Valparaíso', 4000, true),
  ('variante-sur', 'Variante Sur', 6000, true),
  ('vasquez-cobo', 'Vasquez Cobo', 5000, true),
  ('versalles', 'Versalles', 4000, true),
  ('via-cafe-palma', 'Vía Café La Palma', 12000, true),
  ('villa-campo', 'Villa del Campo', 5000, true),
  ('villa-viento', 'Villa del Viento', 8000, true),
  ('villa-docente', 'Villa Docente', 7000, true),
  ('villa-garcia', 'Villa García', 6000, true),
  ('villa-helena', 'Villa Helena', 5000, true),
  ('villas-sur', 'Villas del Sur', 5000, true),
  ('yambitara', 'Yambitara', 8000, true),
  ('yanaconas', 'Yanaconas', 7000, true),
  ('otro', 'Otro barrio (por confirmar)', NULL, true)
on conflict (id) do update
set name = excluded.name, price = excluded.price, active = excluded.active
where (delivery_zones.name, delivery_zones.price, delivery_zones.active)
  is distinct from (excluded.name, excluded.price, excluded.active);
