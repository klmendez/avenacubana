create or replace function public.authorize_staff_email(p_email text,p_role text)
returns void language plpgsql security definer set search_path=public as $$
declare address text := lower(trim(p_email));
begin
  if not coalesce(public.is_la_tuba_admin(),false) then raise exception 'Acceso denegado'; end if;
  if address is null or address !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_role is null or p_role not in ('caja','manana','tarde') then raise exception 'Revisa el correo y el turno'; end if;
  if exists(select 1 from public.admin_emails where email=address) then raise exception 'Ese correo ya es de administración'; end if;
  insert into public.staff_accounts(email,role,active) values(address,p_role,true)
    on conflict(email) do update set role=excluded.role,active=true;
end $$;
revoke all on function public.authorize_staff_email(text,text) from public,anon;
grant execute on function public.authorize_staff_email(text,text) to authenticated;
