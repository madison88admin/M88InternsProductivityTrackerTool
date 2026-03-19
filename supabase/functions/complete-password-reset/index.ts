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
    const { token, password } = await req.json();

    if (!token || !password) {
      return json({ ok: false, error: "Missing token or password" }, 400);
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ── Fetch and validate reset token ───────────────────────
    const { data: row, error: fetchErr } = await adminClient
      .from("reset_tokens")
      .select("token, user_id, email, used_at, expires_at")
      .eq("token", token)
      .single();

    if (fetchErr || !row) {
      return json({ ok: false, error: "not_found" }, 404);
    }

    if (row.used_at) {
      return json({ ok: false, error: "used" }, 400);
    }

    if (new Date(row.expires_at) < new Date()) {
      return json({ ok: false, error: "expired" }, 400);
    }

    // ── Update user's password via admin API ─────────────────
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(
      row.user_id,
      { password }
    );

    if (updateErr) {
      console.error("Failed to update password:", updateErr);
      return json({ ok: false, error: "Failed to update password" }, 500);
    }

    // ── Mark token as used ───────────────────────────────────
    const { error: markErr } = await adminClient
      .from("reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("token", token);

    if (markErr) {
      console.error("Failed to mark token as used:", markErr);
      // Don't fail — password was already updated. This is just cleanup.
    }

    return json({ ok: true, email: row.email });
  } catch (err) {
    console.error("Error:", err);
    return json({ ok: false, error: err.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
