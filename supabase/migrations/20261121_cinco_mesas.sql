create or replace function public.validate_avena_table() returns trigger language plpgsql set search_path=public as $$
begin
  if new.service='local' and coalesce(new.customer->>'mesa','') not in ('1','2','3','4','5') then
    raise exception 'Selecciona una mesa entre 1 y 5';
  end if;
  return new;
end $$;
drop trigger if exists validate_avena_table_on_order on public.orders;
create trigger validate_avena_table_on_order before insert or update of service,customer on public.orders for each row execute function public.validate_avena_table();
