alter table public.catalog_items add column if not exists flavor_name text;
create or replace function public.public_catalog_items() returns setof public.catalog_items
language sql stable security definer set search_path=public as $$
 select c.id,c.name,c.description,c.category,c.item_type,c.price,c.image_url,
  (c.available and exists(select 1 from public.catalog_inventory_requirements r where r.catalog_item_id=c.id)
   and not exists(select 1 from public.catalog_inventory_requirements r join public.inventory_items i on i.id=r.inventory_item_id where r.catalog_item_id=c.id and (i.deleted_at is not null or i.quantity<r.quantity_required))) as available,
  c.business,c.created_at,c.updated_at,c.deleted_at,c.family_name,c.presentation_name,c.flavor_name
 from public.catalog_items c where c.available and c.deleted_at is null and c.business='la_tuba'
$$;
create or replace function public.configure_product_presentations(p_category text,p_item_type text,p_rows jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare r jsonb; product_id uuid; value integer; product_name text; family text; size text; flavor text;
begin
 if not coalesce(public.is_la_tuba_admin(),false) then raise exception 'Solo el administrador puede configurar productos'; end if;
 if coalesce(trim(p_category),'')='' or lower(trim(p_category))='por configurar' or p_item_type is null or p_item_type not in ('carta','bebida','otro') or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>200 then raise exception 'Revisa la categoría y las presentaciones'; end if;
 for r in select * from jsonb_array_elements(p_rows) loop
   product_name:=trim(coalesce(r->>'name','')); family:=trim(coalesce(r->>'family','')); size:=trim(coalesce(r->>'size','')); flavor:=nullif(trim(coalesce(r->>'flavor','')),'');
   if family='' then family:=trim(regexp_replace(product_name, '\s+((vaso\s*)?[0-9]+\s*(oz|lt|litros?)|vaso|gal[oó]n|por unidad|1 unidad|und|paquete\s+x\s*[0-9]+)$', '', 'i')); end if;
   if size='' and not (r ? 'size') then size:=coalesce(nullif(trim(substr(product_name,length(family)+1)),''),'Unidad'); end if;
   if product_name='' or family='' or (size='' and nullif(r->>'id','') is null) or length(product_name)>120 or length(family)>120 or length(size)>80 or length(coalesce(flavor,''))>80 or coalesce(r->>'price','') !~ '^[0-9]{1,9}$' then raise exception 'Revisa el producto, sabor, tamaño y precio'; end if;
   value:=(r->>'price')::integer;
   if nullif(r->>'id','') is not null then
     product_id:=(r->>'id')::uuid;
     update public.catalog_items set price=value,category=trim(p_category),item_type=p_item_type,family_name=family,presentation_name=case when size='' then presentation_name else size end,flavor_name=case when r ? 'flavor' then flavor else flavor_name end,available=case when value=0 then false else available end,updated_at=now() where id=product_id and deleted_at is null and business='la_tuba';
     if not found then raise exception 'Una presentación ya no existe'; end if;
   else
     product_id:=public.create_avena_product(product_name,'',trim(p_category),p_item_type,value,null,false,'unidad',0,0);
     update public.catalog_items set family_name=family,presentation_name=size,flavor_name=flavor where id=product_id;
   end if;
 end loop;
end $$;
