-- La secuencia asigna números únicos incluso si se crean pedidos al mismo tiempo.
create sequence if not exists public.avena_order_number_seq as bigint;

do $$
declare highest bigint;
begin
  select max(substring(order_number from 2)::bigint) into highest
    from public.orders where order_number ~ '^V[0-9]{1,13}$';
  if highest is not null then
    perform setval('public.avena_order_number_seq', greatest(highest, (select last_value from public.avena_order_number_seq)), true);
  end if;
end $$;

create or replace function public.assign_avena_order_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare next_number text;
begin
  next_number := nextval('public.avena_order_number_seq')::text;
  new.order_number := 'V' || lpad(next_number, greatest(13, length(next_number)), '0');
  return new;
end $$;
revoke all on function public.assign_avena_order_number() from public, anon, authenticated;
drop trigger if exists assign_avena_order_number_on_insert on public.orders;
create trigger assign_avena_order_number_on_insert before insert on public.orders
  for each row execute function public.assign_avena_order_number();
