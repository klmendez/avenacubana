create or replace function public.staff_greeting() returns table(role text, number bigint)
language sql stable security definer set search_path='' as $$
 select ranked.role, ranked.number from (
   select s.email,s.role,row_number() over (partition by s.role order by s.email) as number
   from public.staff_accounts s where s.active
 ) ranked where ranked.email=lower(auth.jwt()->>'email') and auth.uid() is not null
$$;
revoke all on function public.staff_greeting() from public,anon;
grant execute on function public.staff_greeting() to authenticated;
