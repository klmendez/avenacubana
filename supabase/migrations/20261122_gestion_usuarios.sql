create or replace function public.list_staff_accounts() returns table(email text,role text,active boolean,account_exists boolean)
language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_la_tuba_admin(),false) then raise exception 'Acceso denegado'; end if;
 return query select s.email,s.role,s.active,exists(select 1 from auth.users u where lower(u.email)=s.email and u.deleted_at is null) from public.staff_accounts s order by s.email;
end $$;
create or replace function public.reset_staff_password(p_email text,p_password text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_la_tuba_admin(),false) then raise exception 'Acceso denegado'; end if;
 if p_password is null or length(p_password)<8 or octet_length(p_password)>72 then raise exception 'La contraseña debe tener al menos 8 caracteres y máximo 72 bytes'; end if;
 if not exists(select 1 from public.staff_accounts s where s.email=lower(trim(p_email)) and s.active) or exists(select 1 from public.admin_emails a where lower(a.email)=lower(trim(p_email))) then raise exception 'Usuario de personal activo no encontrado'; end if;
 update auth.users set encrypted_password=extensions.crypt(p_password,extensions.gen_salt('bf',10)),updated_at=now() where lower(email)=lower(trim(p_email)) and deleted_at is null;
 if not found then raise exception 'La cuenta aún no ha sido creada'; end if;
end $$;
revoke all on function public.list_staff_accounts() from public,anon;
revoke all on function public.reset_staff_password(text,text) from public,anon;
grant execute on function public.list_staff_accounts(),public.reset_staff_password(text,text) to authenticated;
