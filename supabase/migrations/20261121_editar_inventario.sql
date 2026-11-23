create or replace function public.edit_inventory_product(p_id uuid, p_name text, p_unit text, p_minimum numeric, p_quantity numeric, p_expected numeric, p_price integer, p_category text, p_visible boolean)
returns void language plpgsql security definer set search_path=public as $$
declare old_quantity numeric; product_id uuid;
begin
  if not coalesce(public.is_la_tuba_admin(),false) then raise exception 'Acceso denegado'; end if;
  if coalesce(trim(p_name),'')='' or coalesce(trim(p_unit),'')='' or coalesce(trim(p_category),'')='' or least(p_minimum,p_quantity,p_price)<0 or p_minimum is null or p_quantity is null or p_price is null then raise exception 'Revisa los datos del producto'; end if;
  select quantity into strict old_quantity from public.inventory_items where id=p_id for update;
  if old_quantity is distinct from p_expected then raise exception 'La existencia cambió. Vuelve a abrir el producto antes de guardar.'; end if;
  select catalog_item_id into strict product_id from public.catalog_inventory_requirements where inventory_item_id=p_id;
  update public.inventory_items set name=trim(p_name),unit=trim(p_unit),minimum_quantity=p_minimum,quantity=p_quantity,updated_at=now() where id=p_id;
  update public.catalog_items set price=p_price,category=trim(p_category),available=p_visible,updated_at=now() where id=product_id;
  if old_quantity<>p_quantity then
    insert into public.inventory_movements(inventory_item_id,quantity_change,reason) values(p_id,p_quantity-old_quantity,'Ajuste directo de administración');
  end if;
end $$;
revoke all on function public.edit_inventory_product(uuid,text,text,numeric,numeric,numeric,integer,text,boolean) from public,anon;
grant execute on function public.edit_inventory_product(uuid,text,text,numeric,numeric,numeric,integer,text,boolean) to authenticated;
