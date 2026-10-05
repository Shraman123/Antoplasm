# Going online: accounts, cloud saves, leaderboards, co-op

Morrow Lake runs fine with no backend. Online features switch on when the build has two
environment variables pointing at a Supabase project. Supabase's free tier is enough to start.

Everything below needs your own accounts, so these are steps for you to do. Total time is about 20 minutes.

## 1. Create the Supabase project

1. Go to https://supabase.com/dashboard → **New project**. Name it `morrow-lake` and pick the region nearest your players.
2. When it's ready, open **Project Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon / publishable key** → `VITE_SUPABASE_ANON_KEY` (this key is public by design; every table and function is locked down by the migration)
3. Push the database schema from this repo:
   ```
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

## 2. Turn on Google sign-in

1. Go to https://console.cloud.google.com → create a project, or pick an existing one.
2. Open **APIs & Services → OAuth consent screen**. Choose External, set the app name to "Morrow Lake", add your support email, then save.
3. Open **Credentials → Create credentials → OAuth client ID**. Choose **Web application**.
   - Authorised JavaScript origins: `https://morrow-lake.vercel.app`
   - Authorised redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. Copy the client ID and secret into Supabase: **Authentication → Sign In / Providers → Google**, then enable it.
5. In Supabase, open **Authentication → URL Configuration**:
   - Site URL: `https://morrow-lake.vercel.app`
   - Redirect URLs: add `https://morrow-lake.vercel.app/**`

## 3. Deploy with the keys

```
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel --prod --yes --name morrow-lake
```

These are build-time variables (Vite inlines them), so redeploy after changing them.

## What players get

- **Guests** play exactly as before. Their progress stays on their device, and save codes still work.
- **Signing in with Google** keeps the run, achievements and best stats in the cloud. The leaderboard
  shows only the first word of the player's Google name, and players can rename themselves.
- **Two devices**: the lifetime record (achievements, bests) always merges and never loses anything.
  If both devices played the same run since they last synced, the player chooses which run to keep.
- **Friends**: each account has a 6-character friend code. Adding a friend works both ways, and
  friends see each other online and can join each other's room in one click.
- **Leaderboards**: deepest dive, fastest to the bottom, fish caught, money earned and achievements.
  Each one can show everyone or friends only.
- **Co-op**: rooms of up to 4 divers, joined with a 6-character code or an invite link (`?room=CODE`).
  Everyone keeps their own gear, money and depth rating. The fish are shared, and whoever lands the
  killing shot keeps the catch. Reaching the bottom is a solo trip, so you leave the room for the ending.

## How co-op works

- It uses Supabase Realtime **private channels**: only signed-in players can join. The policies are in the migration.
- Each player broadcasts their diver state 8 times a second.
- One player is the **host**: their game runs the fish AI for every diver and streams fish
  snapshots 5 times a second. Everyone else renders those fish, and sends their spear hits to the host.
  The host decides kills and routes bites to the diver who was bitten.
- The host is the longest-present player whose game is open and visible. If they leave or background
  the tab, the next player takes over within about 2.5 s and the fish carry on.
- **Quota**: a full room of 4 sends about 40 messages a second. Check your project's Realtime limits
  under **Project Settings → Usage**. If you grow past the free tier, upgrade, or lower the rates in
  `src/main.ts` (`netTick`).

## Trust

The game runs on each player's device, so leaderboards are trust-based. The server clamps impossible
values (depth over 620 m, an ending in under 5 minutes, negative counts, oversized saves), and nobody can
read or write another player's save. A determined cheater could still post a fake but plausible score.
Server-side run validation would be the next step if that ever matters.

## Local development

```
npx supabase start            # local stack on ports 55420-55429 (won't clash with other projects)
# .env.local:
#   VITE_SUPABASE_URL=http://127.0.0.1:55421
#   VITE_SUPABASE_ANON_KEY=<ANON_KEY printed by supabase start>
npm run dev                    # the Online screen shows a dev email sign-in on local builds
npx supabase test db           # 30 pgTAP tests: access rules, sync conflicts, friends, leaderboards
node scripts/onlineqa.mjs      # accounts, cloud saves, conflicts, friends, leaderboards (3 browsers)
node scripts/coopqa.mjs        # co-op rooms, shared fish, hits/kills/assists, bites, host handover, room cap (6 browsers)
```
