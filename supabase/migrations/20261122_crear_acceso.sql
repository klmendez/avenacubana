create or replace function public.create_staff_login(p_email text, p_password text, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  address text := lower(trim(p_email));
  account_id uuid := gen_random_uuid();
begin
  if not coalesce(public.is_la_tuba_admin(), false) then
    raise exception 'Solo el administrador puede crear usuarios';
  end if;
  if address is null or length(address)>254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_role is null or p_role not in ('caja','manana','tarde') then
    raise exception 'Revisa el correo y el turno';
  end if;
  if p_password is null or length(p_password)<8 or octet_length(p_password)>72 then
    raise exception 'Usa una contraseña de al menos 8 caracteres y hasta 72 bytes';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(address, 0));
  if exists(select 1 from auth.users where lower(email)=address)
     or exists(select 1 from public.admin_emails where lower(email)=address) then
    raise exception 'Este correo ya tiene una cuenta. Usa otro correo para crear un usuario.';
  end if;
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    confirmation_token,recovery_token,email_change_token_new,email_change,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values ('00000000-0000-0000-0000-000000000000',account_id,'authenticated','authenticated',address,
    extensions.crypt(p_password,extensions.gen_salt('bf',10)),now(),'','','','',
    '{"provider":"email","providers":["email"]}',jsonb_build_object('email_verified',true),now(),now());
  insert into auth.identities(user_id,provider_id,provider,identity_data,created_at,updated_at)
  values(account_id,account_id::text,'email',jsonb_build_object('sub',account_id::text,'email',address,'email_verified',true),now(),now());
  insert into public.staff_accounts(email,role,active) values(address,p_role,true)
    on conflict(email) do update set role=excluded.role,active=true;
end $$;
revoke all on function public.create_staff_login(text,text,text) from public,anon;
grant execute on function public.create_staff_login(text,text,text) to authenticated;
