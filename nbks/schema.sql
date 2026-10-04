-- Run once in Supabase → SQL Editor
create table jukebox_items (
  id uuid primary key default gen_random_uuid(),
  title text not null, authorship text, url text not null,
  year_created smallint not null check (year_created between 1000 and 9999),
  month_day_created text check (month_day_created ~ '^([1-9]|1[0-2])/([1-9]|[12][0-9]|3[01])$'),   -- M/D, e.g. 3/14
  year_published smallint not null default extract(year from now())::smallint check (year_published between 1000 and 9999),
  month_day_published text check (month_day_published ~ '^([1-9]|1[0-2])/([1-9]|[12][0-9]|3[01])$'),
  where_created text,
  publisher text, media text, delivery text,
  duration text check (duration ~ '^(0|[1-9][0-9]*):[0-5][0-9](:[0-5][0-9])?$'),  -- M:SS or H:MM:SS, first number unpadded
  notes text,
  course text, mentor text, license text, credits text,
  updated_at timestamptz default now()
);
create table jukebox_slots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references jukebox_items(id) on delete cascade,
  days smallint[] not null,
  start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][05]$'),
  end_time text not null check (end_time ~ '^(([01][0-9]|2[0-3]):[0-5][05]|24:00)$'),
  weeks int not null default 0,
  from_date date not null,
  check (end_time > start_time)
);
alter table jukebox_items enable row level security;
alter table jukebox_slots enable row level security;
-- Screen & Titles (anonymous) can read; only signed-in admin can write
create policy "public read items" on jukebox_items for select using (true);
create policy "public read slots" on jukebox_slots for select using (true);
create policy "admin write items" on jukebox_items for all to authenticated using (true) with check (true);
create policy "admin write slots" on jukebox_slots for all to authenticated using (true) with check (true);
