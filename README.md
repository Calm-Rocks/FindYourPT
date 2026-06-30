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
4. `supabase/migrations/0004_trainer_images.sql` — creates the `trainer-images` storage bucket plus security policies, and adds profile photo / gallery columns to `pts`. **If the bucket-creation statement at the top errors in your SQL editor** (some Supabase projects restrict creating buckets via raw SQL), create it manually instead: Storage → New bucket → name `trainer-images` → Public bucket: ON → File size limit: 5MB → Allowed MIME types: `image/jpeg, image/png` — then run just the policy and `alter table` statements from the file.
5. `supabase/migrations/0005_search_profile_photo_fix.sql` — fixes a bug where `search_pts` never returned `profile_photo_url`.
6. `supabase/migrations/0006_any_distance_search.sql` — adds an `ignore_radius` parameter so a client selecting "Any distance" sees all active trainers, not just those whose own coverage radius happens to reach the search location.
7. `supabase/migrations/0007_verification.sql` — adds trainer verification: an `is_admin` flag, a `verification_status` on each listing, a `verification_submissions` table, a **private** storage bucket for certificates/insurance documents, and updates `search_pts` so only `approved` listings appear in client search. **After running this migration, you must make yourself an admin manually** — see the comment block at the top of the file for the exact SQL.

If you already ran earlier migrations on a live project, just run whichever ones you're missing — they're all additive and won't touch existing trainer or enquiry data.

(`supabase/test_auth_stub.sql` and `supabase/test_storage_stub.sql` are **not** part of your real project — stand-ins used only to test migrations locally before deployment.)

## Image upload security

Profile photos and gallery images go through three independent checks, deliberately not trusting each other:

1. **Client-side validation** (`src/lib/imageUpload.js`) checks file size and reads the file's actual byte signature (not just its filename or browser-reported type) to confirm it's a genuine JPEG or PNG — a file renamed to `photo.jpg` that's actually something else gets rejected here. This layer exists purely for fast feedback; anyone can bypass it by calling the API directly, so it's not the real security boundary.
2. **The storage bucket config** (set in migration 0004) enforces a 5MB size limit and an allowed-MIME-type list server-side, regardless of what a tampered client claims.
3. **Row Level Security policies on Supabase Storage** restrict each trainer to writing only inside a folder matching their own user id (`{user_id}/profile.jpg`, `{user_id}/gallery/{id}.jpg`) — verified by directly testing that one trainer's account cannot write into or delete another trainer's folder, even when explicitly attempting to.

Uploaded files are never executed as code by Supabase Storage — they're served as static downloads only — which rules out the most dangerous class of file-upload exploit by design, separate from the validation layers above.

## Trainer verification

Listings only appear in client search once a trainer's PT qualification certificate and public liability insurance have been reviewed and approved by an admin. This is enforced at the database level, not just hidden in the UI:

- The `verification-docs` storage bucket is **not public** (unlike `trainer-images`) — only the uploading trainer and admins can read these files, verified by testing that a different trainer's account genuinely cannot read another trainer's documents, and that anonymous visitors have no access path at all.
- A trainer cannot approve their own submission — tested directly: a self-approval attempt affects zero rows under RLS.
- `search_pts` only returns listings with `verification_status = 'approved'`, confirmed by testing that an unverified trainer with an otherwise complete, active listing does not appear in search results.
- Admin documents are viewed via short-lived signed URLs (5 minutes), not permanent public links, even though only admins can request them.

To become an admin, see the instructions at the top of `0007_verification.sql` — it's a one-time manual SQL update, deliberately not exposed through any UI.

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
    imageUpload.js      — profile photo / gallery upload, with real file-type validation
    api.js              — all database reads/writes, in one place
    AuthContext.jsx      — login state, available app-wide
    ToastContext.jsx     — small notification popups
  pages/
    SearchPage.jsx           — client-facing search + enquiry flow
    PtProfilePage.jsx        — public trainer profile (bio, gallery, socials), reached by clicking a card
    AuthPage.jsx              — trainer sign up / log in
    DashboardOverviewPage.jsx — trainer's dashboard home: stats + navigation
    ManageListingPage.jsx     — trainer's listing editor (bio, gym, specialisms, socials, images)
    EnquiriesPage.jsx         — trainer's enquiries inbox
  App.jsx                — top-level layout and view switching
supabase/
  migrations/
    0001_init.sql               — core schema, run once
    0002_gyms_and_socials.sql   — gyms table + social/website fields, run after 0001
    0003_gym_aware_search.sql   — gym-aware search function, run after 0002
    0004_trainer_images.sql     — image storage bucket + security policies, run after 0003
```
