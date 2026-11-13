-- Paiements saisis en ariary, euro ou dollar; amount reste la valeur comptable en Ar.
alter table public.payments
  add column if not exists amount_original numeric,
  add column if not exists currency text not null default 'MGA',
  add column if not exists conversion_rate numeric not null default 1;

update public.payments
set amount_original = coalesce(amount_original, amount),
    currency = coalesce(nullif(currency, ''), 'MGA'),
    conversion_rate = coalesce(conversion_rate, 1)
where amount_original is null or currency is null or conversion_rate is null;

alter table public.payments drop constraint if exists payments_currency_check;
alter table public.payments add constraint payments_currency_check check (currency in ('MGA','EUR','USD'));
