// Supabase Edge Function: redeem-entry-pass
// Transactional, Idempotency-Aware, One-Time Entry Pass Redemption

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Authenticate Staff Member from Bearer token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid staff authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Parse request payload
    const { pass_token_or_hash, request_id } = await req.json();
    if (!pass_token_or_hash) {
      return new Response(JSON.stringify({ error: "Missing pass token or hash" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compute SHA-256 hash if raw token is passed
    let tokenHash = pass_token_or_hash.trim();
    if (tokenHash.startsWith("PREDIWALI_PASS_") || tokenHash.length !== 64) {
      const msgBuffer = new TextEncoder().encode(tokenHash);
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
      tokenHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }

    // 3. Call Atomic Database Stored Procedure (Locks row with FOR UPDATE)
    const { data, error } = await supabaseClient.rpc("redeem_entry_pass", {
      p_token_hash: tokenHash,
      p_staff_user_id: user.id,
      p_request_id: request_id || `req-${Date.now()}`,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
