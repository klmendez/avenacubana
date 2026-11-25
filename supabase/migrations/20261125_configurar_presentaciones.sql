create or replace function public.configure_product_presentations(p_category text, p_item_type text, p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r jsonb; product_id uuid; value integer; product_name text;
begin
  if not coalesce(public.is_la_tuba_admin(), false) then raise exception 'Solo el administrador puede configurar productos'; end if;
  if coalesce(trim(p_category), '') = '' or p_item_type not in ('carta','bebida','otro')
    or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 30 then
    raise exception 'Revisa la categoría y las presentaciones';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    product_name := trim(coalesce(r->>'name',''));
    if product_name = '' or length(product_name) > 120 or coalesce(r->>'price','') !~ '^[0-9]{1,9}$' then
      raise exception 'Revisa el nombre y el precio de cada presentación';
    end if;
    value := (r->>'price')::integer;
    if nullif(r->>'id','') is not null then
      product_id := (r->>'id')::uuid;
      update public.catalog_items set price=value, category=trim(p_category), item_type=p_item_type,
        available=case when value=0 then false else available end, updated_at=now()
        where id=product_id and deleted_at is null and business='la_tuba';
      if not found then raise exception 'Una presentación ya no existe'; end if;
    else
      perform public.create_avena_product(product_name,'',trim(p_category),p_item_type,value,null,false,'unidad',0,0);
    end if;
  end loop;
end $$;
revoke all on function public.configure_product_presentations(text,text,jsonb) from public, anon;
grant execute on function public.configure_product_presentations(text,text,jsonb) to authenticated;
