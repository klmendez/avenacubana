alter table public.catalog_items add column if not exists family_name text;
alter table public.catalog_items add column if not exists presentation_name text;

create or replace function public.public_catalog_items()
returns setof public.catalog_items language sql stable security definer set search_path = public as $$
  select c.id,c.name,c.description,c.category,c.item_type,c.price,c.image_url,
    (c.available and exists (select 1 from public.catalog_inventory_requirements r where r.catalog_item_id=c.id)
      and not exists (select 1 from public.catalog_inventory_requirements r join public.inventory_items i on i.id=r.inventory_item_id
        where r.catalog_item_id=c.id and (i.deleted_at is not null or i.quantity<r.quantity_required))) as available,
    c.business,c.created_at,c.updated_at,c.deleted_at,c.family_name,c.presentation_name
  from public.catalog_items c where c.available and c.deleted_at is null and c.business='la_tuba'
$$;

create or replace function public.create_configured_inventory(p_name text,p_unit text,p_minimum numeric,p_initial numeric,p_category text,p_item_type text,p_price integer,p_visible boolean)
returns uuid language plpgsql security definer set search_path=public as $$
declare stock_id uuid; admin boolean;
begin
  admin := coalesce(public.is_la_tuba_admin(),false);
  if not coalesce(public.is_avena_staff(),false) then raise exception 'Acceso denegado'; end if;
  if nullif(trim(p_category),'') is null or lower(trim(p_category))='por configurar' or p_item_type is null or p_item_type not in ('bebida','carta','otro') or p_price is null or p_price<0 then raise exception 'Selecciona tipo y categoría válidos'; end if;
  if not admin and (p_price<>0 or p_visible) then raise exception 'Solo el administrador configura precios y visibilidad'; end if;
  stock_id := public.create_inventory_item(p_name,p_unit,p_minimum,p_initial);
  update public.catalog_items set category=trim(p_category),item_type=p_item_type,price=p_price,available=admin and p_visible and p_price>0,updated_at=now()
    where id=(select catalog_item_id from public.catalog_inventory_requirements where inventory_item_id=stock_id);
  if not found then raise exception 'No se pudo vincular el producto'; end if;
  return stock_id;
end $$;
revoke all on function public.create_configured_inventory(text,text,numeric,numeric,text,text,integer,boolean) from public,anon;
grant execute on function public.create_configured_inventory(text,text,numeric,numeric,text,text,integer,boolean) to authenticated;

create or replace function public.save_inventory_product(p_id uuid,p_name text,p_unit text,p_minimum numeric,p_quantity numeric,p_expected numeric,p_price integer,p_category text,p_visible boolean,p_item_type text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not coalesce(public.is_la_tuba_admin(),false) then raise exception 'Acceso denegado'; end if;
 if p_item_type is null or p_item_type not in ('bebida','carta','otro') or lower(trim(coalesce(p_category,''))) in ('','por configurar') then raise exception 'Selecciona tipo y categoría válidos'; end if;
 perform public.edit_inventory_product(p_id,p_name,p_unit,p_minimum,p_quantity,p_expected,p_price,p_category,p_visible and p_price>0);
 update public.catalog_items set item_type=p_item_type where id=(select catalog_item_id from public.catalog_inventory_requirements where inventory_item_id=p_id) and deleted_at is null;
 if not found then raise exception 'Producto no encontrado'; end if;
end $$;
revoke all on function public.save_inventory_product(uuid,text,text,numeric,numeric,numeric,integer,text,boolean,text) from public,anon;
grant execute on function public.save_inventory_product(uuid,text,text,numeric,numeric,numeric,integer,text,boolean,text) to authenticated;

create or replace function public.configure_product_presentations(p_category text,p_item_type text,p_rows jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare r jsonb; product_id uuid; value integer; product_name text; family text; size text;
begin
 if not coalesce(public.is_la_tuba_admin(),false) then raise exception 'Solo el administrador puede configurar productos'; end if;
 if coalesce(trim(p_category),'')='' or lower(trim(p_category))='por configurar' or p_item_type is null or p_item_type not in ('carta','bebida','otro') or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>30 then raise exception 'Revisa la categoría y las presentaciones'; end if;
 for r in select * from jsonb_array_elements(p_rows) loop
   product_name:=trim(coalesce(r->>'name','')); family:=trim(coalesce(r->>'family','')); size:=trim(coalesce(r->>'size',''));
   if family='' then family:=trim(regexp_replace(product_name, '\s+((vaso\s*)?[0-9]+\s*(oz|lt|litros?)|vaso|gal[oó]n|por unidad|1 unidad|und|paquete\s+x\s*[0-9]+)$', '', 'i')); end if;
   if size='' then size:=coalesce(nullif(trim(substr(product_name,length(family)+1)),''),'Unidad'); end if;
   if product_name='' or family='' or size='' or length(product_name)>120 or length(family)>120 or length(size)>80 or coalesce(r->>'price','') !~ '^[0-9]{1,9}$' then raise exception 'Revisa el producto, tamaño y precio'; end if;
   value:=(r->>'price')::integer;
   if nullif(r->>'id','') is not null then
     product_id:=(r->>'id')::uuid;
     update public.catalog_items set price=value,category=trim(p_category),item_type=p_item_type,family_name=family,presentation_name=size,available=case when value=0 then false else available end,updated_at=now() where id=product_id and deleted_at is null and business='la_tuba';
     if not found then raise exception 'Una presentación ya no existe'; end if;
   else
     product_id:=public.create_avena_product(product_name,'',trim(p_category),p_item_type,value,null,false,'unidad',0,0);
     update public.catalog_items set family_name=family,presentation_name=size where id=product_id;
   end if;
 end loop;
end $$;
