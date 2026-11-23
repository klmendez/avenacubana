create or replace function public.create_avena_product(p_name text,p_description text,p_category text,p_item_type text,p_price integer,p_image_url text,p_available boolean,p_unit text,p_initial numeric,p_minimum numeric) returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid; stock_id uuid;
begin
 if not public.is_la_tuba_admin() then raise exception 'Acceso denegado'; end if;
 if nullif(trim(p_name),'') is null or nullif(trim(p_category),'') is null or nullif(trim(p_unit),'') is null or p_price is null or p_price < 0 or p_initial is null or p_initial < 0 or p_minimum is null or p_minimum < 0 then raise exception 'Revisa los datos del producto'; end if;
 insert into public.catalog_items(name,description,category,item_type,price,image_url,available) values(trim(p_name),coalesce(p_description,''),trim(p_category),p_item_type,p_price,p_image_url,p_available and p_price>0) returning id into new_id;
 select inventory_item_id into stock_id from public.catalog_inventory_requirements where catalog_item_id=new_id;
 update public.inventory_items set unit=trim(p_unit),quantity=p_initial,minimum_quantity=p_minimum,updated_at=now() where id=stock_id;
 if p_initial>0 then insert into public.inventory_movements(inventory_item_id,quantity_change,reason) values(stock_id,p_initial,'Existencia inicial'); end if;
 return new_id;
end $$;
revoke all on function public.create_avena_product(text,text,text,text,integer,text,boolean,text,numeric,numeric) from public;
grant execute on function public.create_avena_product(text,text,text,text,integer,text,boolean,text,numeric,numeric) to authenticated;
revoke delete on public.catalog_items from authenticated;
