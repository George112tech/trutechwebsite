-- Paid downloads for final deliveries (Paystack or SeevPlus).
--
-- On a final delivery the admin can choose a payment provider and a fixed
-- amount. The client-portal function then keeps every download link back
-- until the provider confirms the payment, server to server. Review links
-- never ask for payment.
--
-- The providers' secret keys are saved from the admin (Settings) and can only
-- be read by the server (the edge function, with the service role).
--
-- Safe to run more than once.

begin;

-- What the client must pay before downloading, and when they did.
alter table public.site_deliveries
  add column if not exists pay_provider text,
  add column if not exists pay_amount numeric(12, 2),
  add column if not exists paid_at timestamptz,
  add column if not exists paid_reference text;

alter table public.site_deliveries drop constraint if exists site_deliveries_pay_check;
alter table public.site_deliveries add constraint site_deliveries_pay_check check (
  (pay_provider is null and pay_amount is null)
  or (pay_provider in ('paystack', 'seevplus') and pay_amount between 1 and 100000)
);

-- Every checkout a client started, so a payment is never lost or counted twice.
create table if not exists public.site_delivery_payments (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.site_deliveries (id) on delete cascade,
  provider text not null check (provider in ('paystack', 'seevplus')),
  amount numeric(12, 2) not null check (amount > 0),
  reference text unique,
  status text not null default 'creating' check (status in ('creating', 'pending', 'paid', 'failed')),
  payer_name text not null default '' check (length(payer_name) <= 120),
  payer_email text not null default '' check (length(payer_email) <= 254),
  checkout_url text,
  provider_status text,
  error text,
  created_at timestamptz not null default now(),
  checked_at timestamptz,
  paid_at timestamptz
);
create index if not exists site_delivery_payments_delivery_idx
  on public.site_delivery_payments (delivery_id, created_at desc);

-- The admin reads payments; only the server (service role) writes them.
alter table public.site_delivery_payments enable row level security;
drop policy if exists "admin reads delivery payments" on public.site_delivery_payments;
create policy "admin reads delivery payments" on public.site_delivery_payments
  for select to authenticated using ((select private.is_site_admin()));
revoke all on public.site_delivery_payments from anon, authenticated;
grant select on public.site_delivery_payments to authenticated;
grant select, insert, update, delete on public.site_delivery_payments to service_role;

-- Secret keys: no one can read this table through the API.
create table if not exists private.site_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
revoke all on private.site_secrets from public, anon, authenticated;

-- The admin saves a provider's secret key (it is never shown again).
create or replace function public.site_set_payment_key(p_provider text, p_secret text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_key text := trim(coalesce(p_secret, ''));
begin
  if not private.is_site_admin() then
    raise exception 'Admin access only';
  end if;
  if p_provider not in ('paystack', 'seevplus') then
    raise exception 'Unknown payment provider';
  end if;
  -- Any printable key without spaces (key formats may change).
  if v_key !~ '^[!-~]{16,255}$' then
    raise exception 'That does not look like a secret key';
  end if;
  if p_provider = 'paystack' and v_key !~ '^sk_(live|test)_' then
    raise exception 'A Paystack secret key starts with sk_live_ or sk_test_';
  end if;
  insert into private.site_secrets (key, value, updated_at) values (p_provider || '_secret_key', v_key, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;
revoke all on function public.site_set_payment_key(text, text) from public, anon;
grant execute on function public.site_set_payment_key(text, text) to authenticated;

-- Which keys are saved (for the admin): never the keys themselves.
create or replace function public.site_payment_keys()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_provider text;
  v_row private.site_secrets%rowtype;
begin
  if not private.is_site_admin() then
    raise exception 'Admin access only';
  end if;
  foreach v_provider in array array['paystack', 'seevplus'] loop
    select * into v_row from private.site_secrets where key = v_provider || '_secret_key';
    if found then
      v_out := v_out || jsonb_build_object(v_provider, jsonb_build_object(
        'set', true,
        'last4', right(v_row.value, 4),
        'mode', case when v_row.value ~* '(^|_)live_' then 'live' when v_row.value ~* '(^|_)test_' then 'test' else 'unknown' end,
        'updated_at', v_row.updated_at));
    else
      v_out := v_out || jsonb_build_object(v_provider, jsonb_build_object('set', false));
    end if;
  end loop;
  return v_out;
end;
$$;
revoke all on function public.site_payment_keys() from public, anon;
grant execute on function public.site_payment_keys() to authenticated;

-- The key itself: only for the server.
create or replace function public.site_get_payment_key(p_provider text)
returns text
language sql stable security definer set search_path = '' as $$
  select value from private.site_secrets where key = p_provider || '_secret_key';
$$;
revoke all on function public.site_get_payment_key(text) from public, anon, authenticated;
grant execute on function public.site_get_payment_key(text) to service_role;

commit;
