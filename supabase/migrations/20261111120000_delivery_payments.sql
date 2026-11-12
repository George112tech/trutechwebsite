-- Paid downloads for final deliveries (Paystack or SeevPlus).
--
-- On a final delivery the admin can choose a payment provider and a fixed
-- amount. The client-portal function then keeps every download link back
-- until the provider confirms the payment, server to server. Review links
-- never ask for payment.
--
-- The providers' secret keys, and SeevPlus's webhook signing secret, are
-- saved from the admin (Settings) and can only be read by the server (the
-- edge function, with the service role). Paystack signs its webhooks with
-- the secret key itself, so it needs no separate secret.
--
-- Safe to run more than once, including over an earlier version of this file.

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

-- The secrets the admin can save, by name.
create or replace function private.site_secret_name(p_name text)
returns boolean
language sql immutable set search_path = '' as $$
  select p_name in ('paystack_secret_key', 'seevplus_secret_key', 'seevplus_webhook_secret');
$$;

-- The admin saves a secret (it is never shown again).
create or replace function public.site_set_payment_secret(p_name text, p_secret text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_key text := trim(coalesce(p_secret, ''));
begin
  if not private.is_site_admin() then
    raise exception 'Admin access only';
  end if;
  if not private.site_secret_name(p_name) then
    raise exception 'Unknown payment setting';
  end if;
  -- Any printable text without spaces (key formats may change).
  if v_key !~ '^[!-~]{16,255}$' then
    raise exception 'That doesn’t look like a key: paste the whole key, with no spaces';
  end if;
  if p_name = 'paystack_secret_key' and v_key !~ '^sk_(live|test)_' then
    raise exception 'A Paystack secret key starts with sk_live_ or sk_test_';
  end if;
  insert into private.site_secrets (key, value, updated_at) values (p_name, v_key, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;
revoke all on function public.site_set_payment_secret(text, text) from public, anon;
grant execute on function public.site_set_payment_secret(text, text) to authenticated;

-- The admin removes a secret.
create or replace function public.site_remove_payment_secret(p_name text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_site_admin() then
    raise exception 'Admin access only';
  end if;
  if not private.site_secret_name(p_name) then
    raise exception 'Unknown payment setting';
  end if;
  delete from private.site_secrets where key = p_name;
end;
$$;
revoke all on function public.site_remove_payment_secret(text) from public, anon;
grant execute on function public.site_remove_payment_secret(text) to authenticated;

-- Replaced by site_set_payment_secret (from an earlier version of this file).
drop function if exists public.site_set_payment_key(text, text);
drop function if exists public.site_get_payment_key(text);

-- Which secrets are saved (for the admin): never the secrets themselves.
create or replace function public.site_payment_keys()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_name text;
  v_row private.site_secrets%rowtype;
begin
  if not private.is_site_admin() then
    raise exception 'Admin access only';
  end if;
  foreach v_name in array array['paystack_secret_key', 'seevplus_secret_key', 'seevplus_webhook_secret'] loop
    select * into v_row from private.site_secrets where key = v_name;
    if found then
      v_out := v_out || jsonb_build_object(v_name, jsonb_build_object(
        'set', true,
        'last4', right(v_row.value, 4),
        'mode', case when v_row.value ~* '(^|_)live_' then 'live' when v_row.value ~* '(^|_)test_' then 'test' else 'unknown' end,
        'updated_at', v_row.updated_at));
    else
      v_out := v_out || jsonb_build_object(v_name, jsonb_build_object('set', false));
    end if;
  end loop;
  return v_out;
end;
$$;
revoke all on function public.site_payment_keys() from public, anon;
grant execute on function public.site_payment_keys() to authenticated;

-- A secret itself: only for the server.
create or replace function public.site_get_payment_secret(p_name text)
returns text
language sql stable security definer set search_path = '' as $$
  select value from private.site_secrets where key = p_name and private.site_secret_name(p_name);
$$;
revoke all on function public.site_get_payment_secret(text) from public, anon, authenticated;
grant execute on function public.site_get_payment_secret(text) to service_role;

commit;
