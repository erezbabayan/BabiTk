-- Stripe billing fields for Premium subscriptions

alter table public.users
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text;

comment on column public.users.stripe_customer_id is 'Stripe Customer ID (cus_...)';
comment on column public.users.stripe_subscription_id is 'Active Stripe Subscription ID (sub_...)';
comment on column public.users.subscription_status is 'Stripe subscription status: active, trialing, canceled, etc.';

create index if not exists users_stripe_customer_id_idx
  on public.users (stripe_customer_id)
  where stripe_customer_id is not null;
