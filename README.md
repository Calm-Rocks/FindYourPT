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
they edit their listing) and stored on their row. When a client searches, their
postcode is resolved the same way, and a Postgres function (`search_pts`, defined in
the migration) calculates the straight-line distance from the client to every active
trainer and returns the ones whose **stated coverage radius** reaches that point —
not the client's radius, the trainer's. Results are sorted featured-tier-first, then
nearest. This calculation happens in the database, not in the browser, so it scales
to a large number of trainers without sending all of them to every client.

## One-time setup

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a free project, and wait ~2
minutes for it to provision.

### 2. Run the database migration

In your Supabase project dashboard, open **SQL Editor**, paste the entire contents
of `supabase/migrations/0001_init.sql`, and run it. This creates all tables, the
search function, and the security policies that control who can read/write what.

(`supabase/test_auth_stub.sql` is **not** part of your real project — it's a stand-in
used only to test the migration locally before deployment, and Supabase already
provides the real version of what it fakes.)

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
    SearchPage.jsx       — client-facing search + enquiry flow
    AuthPage.jsx         — trainer sign up / log in
    DashboardPage.jsx    — trainer's own listing editor + enquiries inbox
  App.jsx                — top-level layout and view switching
supabase/
  migrations/0001_init.sql — the entire database schema, run once
```
