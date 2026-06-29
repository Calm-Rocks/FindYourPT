// supabase/functions/notify-enquiry/index.ts
//
// Triggered by a Supabase database webhook on INSERT to the enquiries table.
// Looks up the PT's email and display name, then sends them a notification
// via Resend so they know immediately when a client contacts them.
//
// Environment variables required (set in Supabase dashboard →
// Project Settings → Edge Functions → Secrets):
//   RESEND_API_KEY     — your Resend API key
//   RESEND_FROM_EMAIL  — your verified Resend sending address
//                        e.g. noreply@findyourpt.resend.dev
//   SUPABASE_URL       — your project URL (auto-injected by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY — full-access key for server-side DB lookups
//                               (auto-injected by Supabase)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Supabase webhook sends the new row as { type, table, record, ... }
    const payload = await req.json();
    const enquiry = payload.record;

    if (!enquiry) {
      return new Response(JSON.stringify({ error: 'No record in payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use the service role client so we can read auth.users (not accessible
    // via the anon key) and the pts table without RLS restrictions.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get the PT's email from auth.users
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(enquiry.pt_id);
    if (userError || !userData?.user?.email) {
      console.error('Could not find PT user:', userError);
      return new Response(JSON.stringify({ error: 'PT user not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the PT's display name from the pts table
    const { data: ptData } = await supabase
      .from('pts')
      .select('display_name')
      .eq('id', enquiry.pt_id)
      .maybeSingle();

    const ptName = ptData?.display_name ?? 'there';
    const ptEmail = userData.user.email;

    // Build the email
    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1A1A1A;">
        <h1 style="font-size: 22px; margin-bottom: 8px;">New enquiry, ${ptName}</h1>
        <p style="color: #6B6F76; margin-bottom: 24px;">
          Someone found your FindYourPT listing and wants to get in touch.
        </p>

        <table style="width: 100%; border-collapse: collapse; background: #F5F3EE; border-radius: 4px; overflow: hidden;">
          <tr>
            <td style="padding: 14px 18px; font-weight: 600; width: 120px; vertical-align: top;">Name</td>
            <td style="padding: 14px 18px;">${escapeHtml(enquiry.client_name)}</td>
          </tr>
          <tr style="background: #EAE7DF;">
            <td style="padding: 14px 18px; font-weight: 600; vertical-align: top;">Contact</td>
            <td style="padding: 14px 18px;">${escapeHtml(enquiry.client_contact)}</td>
          </tr>
          ${enquiry.message ? `
          <tr>
            <td style="padding: 14px 18px; font-weight: 600; vertical-align: top;">Message</td>
            <td style="padding: 14px 18px;">${escapeHtml(enquiry.message)}</td>
          </tr>
          ` : ''}
        </table>

        <p style="margin-top: 24px; font-size: 14px; color: #6B6F76;">
          Reply directly to <strong>${escapeHtml(enquiry.client_contact)}</strong> to get in touch.
          You can also view all your enquiries in your
          <a href="${Deno.env.get('SITE_URL') ?? 'https://findyourpt.com'}" style="color: #FF5A3C;">FindYourPT dashboard</a>.
        </p>

        <hr style="border: none; border-top: 1px solid #EAE7DF; margin: 24px 0;" />
        <p style="font-size: 12px; color: #6B6F76; margin: 0;">
          You're receiving this because you have an active listing on FindYourPT.
        </p>
      </div>
    `;

    // Send via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM_EMAIL'),
        to: [ptEmail],
        subject: `New enquiry from ${enquiry.client_name} — FindYourPT`,
        html: emailHtml,
      }),
    });

    if (!resendRes.ok) {
      const resendError = await resendRes.text();
      console.error('Resend error:', resendError);
      return new Response(JSON.stringify({ error: 'Email send failed', detail: resendError }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendData = await resendRes.json();
    console.log('Email sent, id:', resendData.id);

    return new Response(JSON.stringify({ success: true, emailId: resendData.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Simple HTML escape to prevent XSS in email content from user-supplied data.
// Client name, contact, and message all come from untrusted input and must
// be escaped before being inserted into HTML.
function escapeHtml(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
