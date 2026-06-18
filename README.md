# FindYourPT

A directory/matching service for personal trainers. Clients search by postcode and
specialism (hypertrophy, weight loss, gymnastics strength, etc.); trainers create an
account, set their coverage area and specialisms, and appear in matching searches.
No payment processing — this is an intro service, not a booking platform.

## Stack

- **Frontend:** React + Vite
- **Backend:** Supabase (Postgres database, auth, row-level security, no separate
  server to run)
- **Postcode geocoding:** [postcodes.io](https://postcodes.io) — free, no API key

## How the matching actually works

Every trainer's base postcode is resolved to a lat/lon once (at signup, or whenever
they edit their listing) and stored on their row. A trainer can also optionally link
their listing to a gym — either picking one of the curated UK gym branches seeded by
migration 0002, or adding their own if it's not listed. When a client searches, their
postcode is resolved the same way, and a Postgres function (`search_pts`, defined in
the migrations) checks **two** possible ways a trainer can match: their own stated
postcode and travel radius (for mobile/outcall trainers), or their linked gym's fixed
location (since the client is the one travelling to a gym, this check doesn't use the
trainer's travel radius at all — a trainer can show up via their gym even if a client
is well outside their personal radius). Results are sorted featured-tier-first, then
nearest. This calculation happens in the database, not in the browser, so it scales to
a large number of trainers without sending all of them to every client.

## One-time setup

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a free project, and wait ~2
minutes for it to provision.

### 2. Run the database migrations

In your Supabase project dashboard, open **SQL Editor**, and run these files **in order** — paste the entire contents of each, run it, then move to the next:

1. `supabase/migrations/0001_init.sql` — core tables, search function, security policies.
2. `supabase/migrations/0002_gyms_and_socials.sql` — adds gyms, gym linkage on trainer listings, and website/Instagram/Facebook fields. Seeds ~18 real UK gym branches as curated options.
3. `supabase/migrations/0003_gym_aware_search.sql` — replaces the search function so it also matches trainers via their linked gym's location, not just their own postcode/radius.

If you already ran `0001_init.sql` on a live project before these gym features existed, just run `0002` and `0003` on top of it — they're additive and won't touch your existing trainer or enquiry data.

(`supabase/test_auth_stub.sql` is **not** part of your real project — it's a stand-in used only to test migrations locally before deployment.)

### 3. Get your API credentials

In your Supabase dashboard: **Project Settings → API**. Copy the **Project URL** and
the **anon public key**.

### 4. Configure the app

```bash
cp .env.example .env.local
```

Paste your URL and anon key into `.env.local`.

The anon key is meant to be public — it's safe to ship in your frontend bundle.
Row Level Security (defined in the migration) is what actually controls access, not
secrecy of this key.

### 5. Run it locally

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`).

### 6. Deploy it live

The simplest path is [Vercel](https://vercel.com) or [Netlify](https://netlify.com),
both free for this:

1. Push this folder to a GitHub repo.
2. In Vercel/Netlify, "Import project" from that repo.
3. Build command: `npm run build`. Output directory: `dist`.
4. Add the same two environment variables from `.env.local` in the
   project's environment variable settings.
5. Deploy. You'll get a live URL within a minute or two.

## What's real vs. what to revisit

- **Real:** postcode resolution, distance calculation, specialism filtering,
  featured-tier sorting, trainer auth, row-level security (a trainer can only edit
  their own listing; enquiry contact details are only visible to the trainer they
  were sent to).
- **Not yet built:** payment collection (you said off-platform, so this is by
  design), verification/trust badges (deferred on purpose), email notifications
  when an enquiry comes in (currently the trainer has to check their dashboard).
- **Worth revisiting if you grow:** the specialism list is a fixed lookup table —
  adding a new specialism means an `insert` into the `specialisms` table, not a code
  change, but it's still something only you can do via the SQL editor right now
  (no admin UI for it yet).

## Project structure

```
src/
  lib/
    supabaseClient.js   — Supabase connection
    postcode.js         — postcodes.io integration
    api.js              — all database reads/writes, in one place
    AuthContext.jsx      — login state, available app-wide
    ToastContext.jsx     — small notification popups
  pages/
    SearchPage.jsx           — client-facing search + enquiry flow
    AuthPage.jsx              — trainer sign up / log in
    DashboardOverviewPage.jsx — trainer's dashboard home: stats + navigation
    ManageListingPage.jsx     — trainer's listing editor (bio, gym, specialisms, socials)
    EnquiriesPage.jsx         — trainer's enquiries inbox
  App.jsx                — top-level layout and view switching
supabase/
  migrations/
    0001_init.sql               — core schema, run once
    0002_gyms_and_socials.sql   — gyms table + social/website fields, run after 0001
    0003_gym_aware_search.sql   — gym-aware search function, run after 0002
```
