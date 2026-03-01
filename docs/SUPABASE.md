# Supabase Setup (Clockrr)

## What Is Included
- Local Supabase project config in `supabase/`
- Migration for analytics table `public.clockrr_views`
- RLS policies for insert/select
- Indexes for `/stats` query patterns

## Local Environment
1. Pull production env vars from Vercel:
```bash
vercel env pull .env.production.local --environment=production --yes
```
2. Copy required keys into `.env.local` (or create from `.env.example`):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- optional: `SUPABASE_SERVICE_ROLE_KEY`
- `ADDON_URL`
- `PORT`

The app auto-loads `.env.local` via `dotenv`.

## CLI Commands
```bash
npm run supabase:status
npm run supabase:start
npm run supabase:stop
npm run supabase:db:push
npm run supabase:db:reset
```

## Link To Remote Project
If you want CLI push/pull against cloud project:
```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
```

Project ref is the hostname prefix from `SUPABASE_URL`:
`https://<project-ref>.supabase.co`

## Validate Analytics
1. Start app: `npm run dev`
2. Open local stats:
```bash
curl http://localhost:7000/stats
```
3. Confirm fields:
- `total_views`
- `top_content`
- `generated_at`
