create or replace function public.search_sales_contacts(p_query text)
returns table(id uuid, phone text, name text, order_count integer)
language plpgsql stable security definer set search_path=public as $$
declare term text := trim(coalesce(p_query,'')); digits text;
begin
 if not public.is_avena_staff() then raise exception 'Acceso denegado'; end if;
 if length(term)<2 then return; end if;
 digits:=regexp_replace(term,'\D','','g');
 return query select c.id,c.phone,c.name,c.order_count from public.contacts c
 where position(lower(term) in lower(c.name))>0 or (length(digits)>=2 and position(digits in c.phone)>0)
 order by c.order_count desc,c.name limit 8;
end $$;
revoke all on function public.search_sales_contacts(text) from public;
grant execute on function public.search_sales_contacts(text) to authenticated;
