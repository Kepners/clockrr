create or replace function public.clockrr_title_stats(since_iso timestamptz)
returns table (
    content_id text,
    content_type text,
    total_calls bigint,
    unique_users bigint
)
language sql
stable
security definer
set search_path = public
as $$
    with normalized as (
        select
            case
                when content_type = 'series' then split_part(content_id, ':', 1)
                else content_id
            end as normalized_content_id,
            content_type,
            viewer_key
        from public.clockrr_views
        where created_at >= since_iso
    )
    select
        normalized_content_id as content_id,
        content_type,
        count(*)::bigint as total_calls,
        count(distinct viewer_key)::bigint as unique_users
    from normalized
    group by normalized_content_id, content_type
    order by total_calls desc;
$$;

grant execute on function public.clockrr_title_stats(timestamptz) to anon, authenticated;
