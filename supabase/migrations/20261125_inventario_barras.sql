-- Los registros se conservan para que las ventas y movimientos mantengan su historial.
alter table public.inventory_items add column if not exists deleted_at timestamptz;
alter table public.catalog_items add column if not exists deleted_at timestamptz;
drop index if exists public.catalog_items_business_name_unique;
create unique index catalog_items_business_name_unique on public.catalog_items (business, lower(name)) where deleted_at is null;

create or replace function public.public_catalog_items()
returns setof public.catalog_items language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.description, c.category, c.item_type, c.price, c.image_url,
    (c.available and exists (select 1 from public.catalog_inventory_requirements r where r.catalog_item_id = c.id)
      and not exists (select 1 from public.catalog_inventory_requirements r join public.inventory_items i on i.id=r.inventory_item_id
                      where r.catalog_item_id=c.id and (i.deleted_at is not null or i.quantity < r.quantity_required))) as available,
    c.business, c.created_at, c.updated_at, c.deleted_at
  from public.catalog_items c where c.available and c.deleted_at is null and c.business = 'la_tuba'
$$;

create or replace function public.archive_inventory_product(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_la_tuba_admin() then raise exception 'Solo el administrador puede eliminar productos'; end if;
  update public.inventory_items set deleted_at = now(), updated_at = now()
    where id = p_id and deleted_at is null;
  if not found then raise exception 'Producto no encontrado'; end if;
  update public.catalog_items set deleted_at = now(), available = false, updated_at = now()
    where id in (select catalog_item_id from public.catalog_inventory_requirements where inventory_item_id = p_id);
end $$;
revoke all on function public.archive_inventory_product(uuid) from public, anon;
grant execute on function public.archive_inventory_product(uuid) to authenticated;

create or replace function public.sale_catalog() returns table(id uuid,name text,price integer,category text,item_type text,image_url text,quantity numeric,minimum_quantity numeric,unit text)
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.is_avena_staff() then raise exception 'Acceso denegado'; end if;
 return query select c.id,c.name,c.price,c.category,c.item_type,c.image_url,i.quantity,i.minimum_quantity,i.unit
 from public.catalog_items c join public.catalog_inventory_requirements r on r.catalog_item_id=c.id join public.inventory_items i on i.id=r.inventory_item_id
 where c.business='la_tuba' and c.available and c.price>0 and c.deleted_at is null and i.deleted_at is null order by c.category,c.name;
end $$;

-- Los valores 6 a 9 representan las barras 1 a 4 en pedidos internos.
create or replace function public.validate_avena_table() returns trigger language plpgsql set search_path=public as $$
begin
  if new.service='local' and (coalesce(new.customer->>'mesa','') not in ('1','2','3','4','5','6','7','8','9')
    or (new.channel <> 'admin' and new.customer->>'mesa' not in ('1','2','3','4','5'))) then
    raise exception 'Selecciona una mesa o barra válida';
  end if;
  return new;
end $$;
