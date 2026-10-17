// Supabase Edge Function: send-email via Resend.
// @ts-nocheck — Deno runtime: checked by `supabase functions deploy`, not tsc.
//
// Deploy with:
//   supabase functions deploy send-email
// Required secret (replace re_xxxxxxxxx with your real API key — set it here, never in app code):
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxxx
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { Resend } from 'https://esm.sh/resend@4.0.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get('RESEND_API_KEY') ?? '';
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Email service is not configured.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { to, subject, html, from } = await req.json().catch(() => ({}));
    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ error: 'Missing to, subject, or html.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: from ?? 'onboarding@resend.dev',
      to,
      subject,
      html,
    });
    if (error) throw error;
    return new Response(JSON.stringify({ id: data?.id ?? null }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Send failed.';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
