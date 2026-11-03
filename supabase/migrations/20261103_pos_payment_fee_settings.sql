-- Donatello POS: configuración única de comisiones, APAGADA inicialmente.
-- No modifica precios de productos ni tablas de ventas.
create table if not exists public.pos_payment_fee_settings (
  id smallint primary key check (id = 1),
  enabled boolean not null default false,
  provider text not null default 'Por definir' check (char_length(provider) between 1 and 80),
  rate_percent numeric(6,3) not null default 3.500 check (rate_percent between 0 and 20),
  fixed_fee_mxn numeric(10,2) not null default 0 check (fixed_fee_mxn between 0 and 1000),
  vat_percent numeric(5,2) not null default 16 check (vat_percent between 0 and 30),
  updated_at timestamptz not null default now()
);

insert into public.pos_payment_fee_settings (id, enabled)
values (1, false)
on conflict (id) do nothing;

alter table public.pos_payment_fee_settings enable row level security;

revoke all on table public.pos_payment_fee_settings from public, anon, authenticated;
grant select, update on table public.pos_payment_fee_settings to authenticated;

drop policy if exists "pos_fee_authorized_read" on public.pos_payment_fee_settings;
create policy "pos_fee_authorized_read" on public.pos_payment_fee_settings
  for select to authenticated using (
    exists (
      select 1 from public.pos_authorized_users pau
      where pau.user_id = (select auth.uid()) and pau.active = true
    )
  );

drop policy if exists "pos_fee_admin_update" on public.pos_payment_fee_settings;
create policy "pos_fee_admin_update" on public.pos_payment_fee_settings
  for update to authenticated using (
    exists (
      select 1 from public.pos_authorized_users pau
      where pau.user_id = (select auth.uid()) and pau.active = true and pau.role = 'admin'
    )
  ) with check (
    id = 1
    and exists (
      select 1 from public.pos_authorized_users pau
      where pau.user_id = (select auth.uid()) and pau.active = true and pau.role = 'admin'
    )
  );
