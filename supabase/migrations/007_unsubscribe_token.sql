-- Add a random, opaque unsubscribe token to profiles so that the
-- unsubscribe link cannot be used to disable arbitrary accounts by guessing user IDs.
alter table profiles
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();

create unique index if not exists profiles_unsubscribe_token_idx on profiles(unsubscribe_token);
