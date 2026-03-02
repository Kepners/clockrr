alter table public.clockrr_views
    add column if not exists viewer_key text;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'clockrr_views_viewer_key_len'
    ) then
        alter table public.clockrr_views
            add constraint clockrr_views_viewer_key_len
            check (viewer_key is null or char_length(viewer_key) between 8 and 64);
    end if;
end
$$;

create index if not exists idx_clockrr_views_viewer_key_created_at
    on public.clockrr_views (viewer_key, created_at desc)
    where viewer_key is not null;

comment on column public.clockrr_views.viewer_key is
    'Anonymous salted fingerprint used for approximate unique viewer counts.';

drop policy if exists "clockrr insert views" on public.clockrr_views;
create policy "clockrr insert views"
on public.clockrr_views
for insert
to anon, authenticated
with check (
    content_type in ('movie', 'series')
    and char_length(content_id) between 2 and 128
    and (viewer_key is null or char_length(viewer_key) between 8 and 64)
);
