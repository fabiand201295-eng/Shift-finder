-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query > paste > Run).

create table if not exists requests (
  id bigint generated always as identity primary key,
  kind text not null,              -- 'cover' or 'extra'
  name text,                       -- person giving up a shift (null for 'extra')
  grade text not null,             -- 'BST' or 'HST'
  day int not null,                -- day offset used by the app's calendar
  code text not null,              -- shift code: A / B / C / N
  reason text,
  posted_by text not null,
  covered_by text,
  paperwork_done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists wants_extra (
  name text primary key
);

create table if not exists overrides (
  key text primary key,            -- "<name>|<day>"
  value text not null              -- shift code that day now resolves to
);

-- Row Level Security: enabled, with a single open policy for each table.
-- This app has no server-side login (see the app's own "who are you" picker instead),
-- so anon read/write is intentional here — anyone with the anon key (i.e. anyone who
-- can load your deployed site) can read and write. That's appropriate for an internal
-- tool behind a private link, not for anything public-facing.
alter table requests enable row level security;
alter table wants_extra enable row level security;
alter table overrides enable row level security;

create policy "anon full access" on requests for all using (true) with check (true);
create policy "anon full access" on wants_extra for all using (true) with check (true);
create policy "anon full access" on overrides for all using (true) with check (true);

-- Turn on realtime so everyone's screen updates live without refreshing.
alter publication supabase_realtime add table requests;
alter publication supabase_realtime add table wants_extra;
alter publication supabase_realtime add table overrides;
