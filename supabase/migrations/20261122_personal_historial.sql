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
