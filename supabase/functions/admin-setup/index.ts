// @ts-nocheck — Deno runtime (Supabase Edge Functions)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_SECRET_KEY = Deno.env.get("ADMIN_SECRET_KEY")!;

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
    const { secretKey, email, password, fullName } = await req.json();

    // ── Validate inputs ──────────────────────────────────────
    if (!secretKey || !email || !password || !fullName) {
      return json({ error: "Missing required fields" }, 400);
    }

    if (!ADMIN_SECRET_KEY || secretKey !== ADMIN_SECRET_KEY) {
      return json({ error: "Invalid secret key." }, 403);
    }

    if (password.length < 8) {
      return json({ error: "Password must be at least 8 characters" }, 400);
    }

    // ── Create admin user via admin API (bypasses signUp flow) ─
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "admin" },
    });

    if (createErr) {
      return json({ error: createErr.message }, 400);
    }

    const userId = newUser.user.id;

    // ── Ensure profile has admin role (trigger may have created it) ─
    await adminClient
      .from("profiles")
      .update({ full_name: fullName, role: "admin" })
      .eq("id", userId);

    return json({ ok: true, userId });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
