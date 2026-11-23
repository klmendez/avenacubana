create schema if not exists breb_private;
revoke all on schema breb_private from public, anon, authenticated;

create table if not exists breb_private.inbox (
  singleton boolean primary key check (singleton),
  ingestion_key text not null default (gen_random_uuid()::text || gen_random_uuid()::text)
);
revoke all on breb_private.inbox from public, anon, authenticated;
insert into breb_private.inbox(singleton) values (true) on conflict do nothing;

create table if not exists public.breb_notices (
  id bigint generated always as identity primary key,
  message_key text unique not null check (message_key ~ '^[0-9a-f]{64}$'),
  transfer_key text unique check (transfer_key ~ '^[0-9a-f]{64}$'),
  payer text not null check (length(trim(payer)) between 2 and 100),
  amount numeric(15,2) not null check (amount > 0 and amount < 'Infinity'::numeric),
  account_last4 text check (account_last4 ~ '^[0-9]{4}$'),
  received_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  announced_at timestamptz
);
alter table public.breb_notices enable row level security;
revoke all on public.breb_notices from public, anon, authenticated;
grant select (id, payer, amount, account_last4, received_at, recorded_at) on public.breb_notices to authenticated;
drop policy if exists breb_read on public.breb_notices;
create policy breb_read on public.breb_notices for select to authenticated
using (public.is_la_tuba_admin() or public.avena_staff_role()='caja');

create or replace function public.ingest_breb_notice(p_message_key text, p_transfer_key text, p_payer text,
 p_amount numeric, p_account_last4 text, p_received_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists (select 1 from breb_private.inbox where ingestion_key =
    (current_setting('request.headers', true)::jsonb ->> 'x-breb-key')) then
    raise exception 'Acceso denegado' using errcode='42501';
  end if;
  insert into public.breb_notices(message_key, transfer_key, payer, amount, account_last4, received_at)
  values(p_message_key, p_transfer_key, trim(p_payer), p_amount, p_account_last4, p_received_at)
  on conflict do nothing;
end $$;
revoke all on function public.ingest_breb_notice(text,text,text,numeric,text,timestamptz) from public, authenticated, anon;
grant execute on function public.ingest_breb_notice(text,text,text,numeric,text,timestamptz) to anon;

-- A single enabled terminal may announce each new notice. Manual replay only reads history.
create or replace function public.claim_breb_announcement(p_since timestamptz)
returns table(id bigint, payer text, amount numeric) language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(public.is_la_tuba_admin() or public.avena_staff_role()='caja',false) then
    raise exception 'Acceso denegado' using errcode='42501';
  end if;
  return query
    update public.breb_notices n set announced_at=clock_timestamp()
    where n.id=(select q.id from public.breb_notices q
      where q.announced_at is null and q.recorded_at >= greatest(p_since, now()-interval '10 minutes')
        and q.received_at >= now()-interval '10 minutes'
      order by q.id limit 1 for update skip locked)
    returning n.id,n.payer,n.amount;
end $$;
revoke all on function public.claim_breb_announcement(timestamptz) from public, anon, authenticated;
grant execute on function public.claim_breb_announcement(timestamptz) to authenticated;
