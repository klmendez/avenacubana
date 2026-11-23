drop policy if exists "Turnos consultan mesas" on public.orders;
create policy "Turnos consultan mesas" on public.orders for select to authenticated
using (business='la_tuba' and service='local' and public.avena_staff_role() in ('manana','tarde'));
