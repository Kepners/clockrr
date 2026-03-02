create or replace function public.clockrr_rollup_stats()
returns table (
    window_key text,
    total_calls bigint,
    unique_users bigint
)
language sql
stable
security definer
set search_path = public
as $$
    with windows(window_key, since_ts) as (
        values
            ('24h'::text, now() - interval '24 hours'),
            ('7d'::text, now() - interval '7 days'),
            ('30d'::text, now() - interval '30 days')
    )
    select
        windows.window_key,
        count(clockrr_views.*)::bigint as total_calls,
        count(distinct clockrr_views.viewer_key)::bigint as unique_users
    from windows
    left join public.clockrr_views
        on clockrr_views.created_at >= windows.since_ts
    group by windows.window_key
    order by case windows.window_key
        when '24h' then 1
        when '7d' then 2
        else 3
    end;
$$;

grant execute on function public.clockrr_rollup_stats() to anon, authenticated;
