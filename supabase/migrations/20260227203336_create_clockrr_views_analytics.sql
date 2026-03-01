create table if not exists public.clockrr_views (
    id bigint generated always as identity primary key,
    content_id text not null,
    content_type text not null check (content_type in ('movie', 'series')),
    created_at timestamptz not null default now(),
    constraint clockrr_views_content_id_len check (char_length(content_id) between 2 and 128)
);

create index if not exists idx_clockrr_views_created_at
    on public.clockrr_views (created_at desc);

create index if not exists idx_clockrr_views_content_id_created_at
    on public.clockrr_views (content_id, created_at desc);

create index if not exists idx_clockrr_views_content_type_created_at
    on public.clockrr_views (content_type, created_at desc);

comment on table public.clockrr_views is 'Raw watch events tracked by Clockrr.';

grant usage on schema public to anon, authenticated;
grant insert, select on public.clockrr_views to anon, authenticated;

alter table public.clockrr_views enable row level security;

drop policy if exists "clockrr insert views" on public.clockrr_views;
create policy "clockrr insert views"
on public.clockrr_views
for insert
to anon, authenticated
with check (
    content_type in ('movie', 'series')
    and char_length(content_id) between 2 and 128
);

drop policy if exists "clockrr read views" on public.clockrr_views;
create policy "clockrr read views"
on public.clockrr_views
for select
to anon, authenticated
using (true);
