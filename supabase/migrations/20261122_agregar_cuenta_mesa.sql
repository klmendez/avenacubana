create table if not exists public.order_addition_requests (
  request_id uuid primary key,
  order_id uuid not null references public.orders(id),
  created_at timestamptz not null default now()
);
alter table public.order_addition_requests enable row level security;
revoke all on public.order_addition_requests from public, anon, authenticated;

create or replace function public.add_table_order_items(p_order_id uuid, p_items jsonb, p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  ord public.orders%rowtype;
  quote jsonb;
  previous_order uuid;
  promo jsonb;
  new_items jsonb;
begin
  if not public.is_avena_staff() then raise exception 'Acceso denegado'; end if;
  if p_request_id is null then raise exception 'Solicitud inválida'; end if;
  perform pg_advisory_xact_lock(hashtext(p_request_id::text));
  select order_id into previous_order from public.order_addition_requests where request_id = p_request_id;
  if found then
    if previous_order <> p_order_id then raise exception 'Solicitud ya utilizada'; end if;
    return;
  end if;
  select * into ord from public.orders where id = p_order_id and business = 'la_tuba' for update;
  if not found or ord.service <> 'local' or ord.status = 'cancelado' or ord.paid_total >= ord.total then
    raise exception 'La cuenta ya fue pagada, cancelada o no está disponible';
  end if;
  perform p.id from public.promotions p where p.active order by p.id for update;
  quote := public.quote_order(jsonb_build_object('items', p_items, 'servicio', 'local', 'canal', 'admin'));
  select jsonb_agg(jsonb_set(item, '{id}', to_jsonb(gen_random_uuid()::text)))
    into new_items from jsonb_array_elements(quote->'items') item;
  for promo in select value from jsonb_array_elements(quote->'promociones') loop
    update public.promotions set data=jsonb_set(data, '{usosActuales}', to_jsonb(coalesce((data->>'usosActuales')::integer, 0) + 1)), updated_at=now()
      where id=(promo->>'promoId')::uuid;
  end loop;
  update public.orders set
    items = ord.items || new_items,
    subtotal = ord.subtotal + (quote->>'subtotal')::integer,
    total = ord.total + (quote->>'total')::integer,
    discount_total = coalesce(ord.discount_total, 0) + (quote->>'descuentoTotal')::integer,
    promotions = coalesce(ord.promotions, '[]'::jsonb) || (quote->'promociones'),
    updated_at = now()
  where id = p_order_id;
  insert into public.order_addition_requests(request_id, order_id) values(p_request_id, p_order_id);
end $$;
revoke all on function public.add_table_order_items(uuid,jsonb,uuid) from public, anon;
grant execute on function public.add_table_order_items(uuid,jsonb,uuid) to authenticated;
