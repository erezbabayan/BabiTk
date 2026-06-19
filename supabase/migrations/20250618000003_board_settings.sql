-- Per-user notebook (inbox) auto-archive delay before items move to archive
alter table public.users
  add column if not exists inbox_archive_hours integer not null default 48;

alter table public.users
  add constraint users_inbox_archive_hours_check
  check (inbox_archive_hours in (48, 72, 168, 720));

comment on column public.users.inbox_archive_hours is
  'Hours of inactivity on the notebook board before inbox items auto-archive (48=2d, 72=3d, 168=1w, 720=1m)';
