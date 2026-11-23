-- Cada producto de venta corresponde a una existencia; el precio pendiente no se publica.
begin;
-- Corrige una asociacion heredada duplicada entre el litro y el galon.
delete from public.catalog_inventory_requirements r using public.catalog_items c, public.inventory_items i
where r.catalog_item_id=c.id and r.inventory_item_id=i.id
  and c.name='Yogurt de Maracumango 1 Lt' and i.name='YOGURT DE MARACUMANGO';
do $$
declare i record; c_id uuid; clean_name text;
begin
  if exists (select 1 from public.catalog_inventory_requirements group by catalog_item_id having count(*)>1)
     or exists (select 1 from public.catalog_inventory_requirements group by inventory_item_id having count(*)>1) then
    raise exception 'Hay productos con multiples vinculos; revisa el inventario antes de continuar';
  end if;
  for i in select * from public.inventory_items x where not exists(select 1 from public.catalog_inventory_requirements r where r.inventory_item_id=x.id) loop
    clean_name:=i.name;
    if exists(select 1 from public.catalog_items c where lower(c.name)=lower(clean_name) and c.business='la_tuba') then
      clean_name:=i.name || ' (' || i.unit || ')';
    end if;
    insert into public.catalog_items(name,category,item_type,price,available) values(clean_name,'Por configurar','otro',0,false) returning id into c_id;
    insert into public.catalog_inventory_requirements values(c_id,i.id,1);
  end loop;
  for i in select * from public.catalog_items c where not exists(select 1 from public.catalog_inventory_requirements r where r.catalog_item_id=c.id) loop
    insert into public.inventory_items(name,unit) values(i.name,'unidad') returning id into c_id;
    insert into public.catalog_inventory_requirements values(i.id,c_id,1);
  end loop;
end $$;
create unique index if not exists inventory_one_product on public.catalog_inventory_requirements(inventory_item_id);
create unique index if not exists product_one_inventory on public.catalog_inventory_requirements(catalog_item_id);
create or replace function public.auto_create_inventory_product() returns trigger language plpgsql security definer set search_path=public as $$
declare other_id uuid;
begin
  if pg_trigger_depth()>1 then return new; end if;
  if tg_table_name='inventory_items' then
    insert into public.catalog_items(name,category,item_type,price,available) values(new.name,'Por configurar','otro',0,false) returning id into other_id;
    insert into public.catalog_inventory_requirements values(other_id,new.id,1);
  else
    insert into public.inventory_items(name,unit) values(new.name,'unidad') returning id into other_id;
    insert into public.catalog_inventory_requirements values(new.id,other_id,1);
  end if;
  return new;
end $$;
drop trigger if exists auto_product_after_inventory_insert on public.inventory_items;
create trigger auto_product_after_inventory_insert after insert on public.inventory_items for each row execute function public.auto_create_inventory_product();
drop trigger if exists auto_inventory_after_product_insert on public.catalog_items;
create trigger auto_inventory_after_product_insert after insert on public.catalog_items for each row execute function public.auto_create_inventory_product();
create or replace function public.sync_product_inventory_name() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if pg_trigger_depth()>1 or new.name is not distinct from old.name then return new; end if;
 if tg_table_name='inventory_items' then
   update public.catalog_items set name=new.name,updated_at=now() where id=(select catalog_item_id from public.catalog_inventory_requirements where inventory_item_id=new.id);
 else
   update public.inventory_items set name=new.name,updated_at=now() where id=(select inventory_item_id from public.catalog_inventory_requirements where catalog_item_id=new.id);
 end if;
 return new;
end $$;
drop trigger if exists sync_name_inventory on public.inventory_items;
create trigger sync_name_inventory after update of name on public.inventory_items for each row execute function public.sync_product_inventory_name();
drop trigger if exists sync_name_catalog on public.catalog_items;
create trigger sync_name_catalog after update of name on public.catalog_items for each row execute function public.sync_product_inventory_name();
create or replace function public.sale_catalog() returns table(id uuid,name text,price integer,category text,item_type text,image_url text,quantity numeric,minimum_quantity numeric,unit text)
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.is_avena_staff() then raise exception 'Acceso denegado'; end if;
 return query select c.id,c.name,c.price,c.category,c.item_type,c.image_url,i.quantity,i.minimum_quantity,i.unit
 from public.catalog_items c join public.catalog_inventory_requirements r on r.catalog_item_id=c.id join public.inventory_items i on i.id=r.inventory_item_id
 where c.business='la_tuba' and c.available and c.price>0 order by c.category,c.name;
end $$;
revoke all on function public.sale_catalog() from public;
grant execute on function public.sale_catalog() to authenticated;
commit;
