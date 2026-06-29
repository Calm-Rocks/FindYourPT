# Deploying the enquiry notification Edge Function

## What this does
When a client submits an enquiry through the site, a Supabase database webhook
fires immediately, calling this Edge Function, which emails the PT with the
client's name, contact details, and message via Resend.

---

## Prerequisites
- Resend account set up and SMTP configured in Supabase auth (Part 1)
- Supabase CLI installed: `npm install -g supabase`

---

## Step 1 — Install Supabase CLI and log in

```bash
npm install -g supabase
supabase login
```

This opens a browser window to authenticate with your Supabase account.

---

## Step 2 — Link your project

In the `findyourpt` folder:

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Your project ref is the string in your Supabase project URL:
`https://supabase.com/dashboard/project/YOUR_PROJECT_REF`

---

## Step 3 — Set the Edge Function secrets

These are environment variables the function reads at runtime. Set them
in the Supabase dashboard under:
**Project Settings → Edge Functions → Add new secret**

Add all four:

| Secret name             | Value                                         |
|-------------------------|-----------------------------------------------|
| `RESEND_API_KEY`        | Your Resend API key                           |
| `RESEND_FROM_EMAIL`     | e.g. `noreply@findyourpt.resend.dev`          |
| `SITE_URL`              | Your Netlify URL e.g. `https://trainernearme.netlify.app` |

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically
by Supabase — you don't need to set those manually.)

---

## Step 4 — Deploy the function

```bash
supabase functions deploy notify-enquiry --no-verify-jwt
```

`--no-verify-jwt` is intentional: this function is called by a Supabase
internal webhook (not by a browser user), so there's no JWT to verify.
Supabase's own webhook infrastructure handles authentication.

After deploying, the function URL will be shown — it looks like:
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-enquiry`

Copy this URL — you need it for the next step.

---

## Step 5 — Wire up the database webhook

In Supabase dashboard → **Database → Webhooks → Create a new hook**:

- **Name:** `on_enquiry_insert`
- **Table:** `enquiries`
- **Events:** check `INSERT` only
- **Webhook URL:** your function URL from Step 4
- **HTTP method:** POST
- **Headers:** add `Content-Type: application/json`

Save it. That's the wiring done.

---

## Step 6 — Test it end to end

1. Go to your live site
2. Search for a trainer and submit a real enquiry using your own email
   as the PT (or use a test PT account you control)
3. The PT's email should arrive within a few seconds

If it doesn't arrive:
- Check Supabase dashboard → Database → Webhooks → your hook → recent
  deliveries for any errors
- Check Supabase dashboard → Edge Functions → notify-enquiry → Logs
  for any runtime errors in the function itself
- Check your Resend dashboard → Emails for delivery status

---

## Adding to version control

The function file lives at `supabase/functions/notify-enquiry/index.ts`
and is already in your project — commit and push it with the rest of
your code. The secrets are NOT in the repo (they live only in Supabase's
secret store), which is correct.
