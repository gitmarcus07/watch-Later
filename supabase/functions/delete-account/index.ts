// Supabase Edge Function: delete-account.
// @ts-nocheck — Deno runtime: checked by `supabase functions deploy`, not tsc.
//
// Deletes the calling auth user (service-role). Every user table references
// auth.users(id) ON DELETE CASCADE, so profiles, library rows, watchlist,
// watches, favorites, ratings, and interest marks all disappear with it.
//
// Deploy with:
//   supabase functions deploy delete-account
// Required secrets:
//   supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     SUPABASE_ANON_KEY=...
//
// The client always wipes its own rows + local data first and treats this
// function as best-effort, so users are never blocked when it isn't
// deployed yet.
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // SUPABASE_URL + SUPABASE_ANON_KEY are injected by the platform. Only
    // the service-role key is a custom secret (the CLI reserves the
    // SUPABASE_ prefix, so it lives under SERVICE_ROLE_KEY).
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return new Response(JSON.stringify({ error: 'Function is not configured.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Identify the caller with their own token (never trust a body user_id).
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await caller.auth.getUser();
    const userId = userData?.user?.id;
    if (userError || !userId) {
      return new Response(JSON.stringify({ error: 'Invalid session.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const admin = createClient(supabaseUrl, serviceKey);
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;
    return new Response(JSON.stringify({ deleted: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Deletion failed.';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
