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

/** Same rules enforced on the client — enforced here as the authoritative check. */
function isStrongPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return json({ ok: false, error: "Missing token or password" }, 400);
    }

    // ── Server-side password strength check ─────────────────
    if (!isStrongPassword(password)) {
      return json({
        ok: false,
        error: "Password does not meet strength requirements.",
      }, 400);
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ── Validate token ───────────────────────────────────────
    const { data: row, error: tokenErr } = await adminClient
      .from("invite_tokens")
      .select("token, user_id, email, used_at, expires_at")
      .eq("token", token)
      .single();

    if (tokenErr || !row) {
      return json({ ok: false, error: "not_found" }, 400);
    }

    if (row.used_at) {
      return json({ ok: false, error: "used" }, 400);
    }

    if (new Date(row.expires_at) < new Date()) {
      return json({ ok: false, error: "expired" }, 400);
    }

    // ── Set password via admin API ───────────────────────────
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(
      row.user_id,
      { password }
    );

    if (updateErr) {
      return json({ ok: false, error: updateErr.message }, 500);
    }

    // ── Mark token as used ───────────────────────────────────
    await adminClient
      .from("invite_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("token", token);

    return json({ ok: true, email: row.email });
  } catch (err) {
    return json({ ok: false, error: err.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
