// @ts-nocheck — Deno runtime (Supabase Edge Functions), not Node.js
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const { token } = await req.json();

    if (!token) {
      return json({ valid: false, error: "not_found" });
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: row, error } = await adminClient
      .from("reset_tokens")
      .select("token, user_id, email, used_at, expires_at")
      .eq("token", token)
      .single();

    if (error || !row) {
      return json({ valid: false, error: "not_found" });
    }

    if (row.used_at) {
      return json({ valid: false, error: "used" });
    }

    if (new Date(row.expires_at) < new Date()) {
      return json({ valid: false, error: "expired" });
    }

    return json({ valid: true, email: row.email });
  } catch (err) {
    return json({ valid: false, error: "server_error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
