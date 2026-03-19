// @ts-nocheck — Deno runtime (Supabase Edge Functions), not Node.js
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL");
const SENDER_NAME = Deno.env.get("SENDER_NAME") || "M88 Tracker";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // ── Verify caller is authenticated ────────────────────────
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return json({ error: "Unauthorized: missing bearer token" }, 401);
    }

    // Decode JWT to verify it's valid (basic validation)
    try {
      const parts = jwt.split(".");
      if (parts.length !== 3) throw new Error("invalid token format");
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(b64));
      if (!payload.sub) throw new Error("missing user ID");
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return json({ error: "Unauthorized: token expired" }, 401);
      }
    } catch {
      return json({ error: "Unauthorized: invalid token" }, 401);
    }

    if (!BREVO_API_KEY || !SENDER_EMAIL) {
      return json(
        { error: "Missing required secrets: BREVO_API_KEY and/or SENDER_EMAIL" },
        500,
      );
    }

    const { to, subject, html } = await req.json();

    if (!to || !subject || !html) {
      return json({ error: "Missing required fields: to, subject, html" }, 400);
    }

    const recipients = Array.isArray(to)
      ? to
          .map((value) => {
            if (typeof value === "string") return { email: value };
            if (value && typeof value.email === "string") return { email: value.email };
            return null;
          })
          .filter(Boolean)
      : [{ email: to }];

    if (!recipients.length || !recipients[0]?.email) {
      return json({ error: "Invalid recipient format for 'to'" }, 400);
    }

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: recipients,
        subject,
        htmlContent: html,
      }),
    });

    const raw = await res.text();
    let data: unknown = raw;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = raw;
    }

    return json({ ok: res.ok, data }, res.ok ? 200 : 502);
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
