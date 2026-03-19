// @ts-nocheck — Deno runtime (Supabase Edge Functions), not Node.js
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL")!;
const SENDER_NAME = Deno.env.get("SENDER_NAME") || "M88 Tracker";
const APP_URL = Deno.env.get("APP_URL")!;

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
    // ── Parse request body ───────────────────────────────────
    const { email } = await req.json();

    if (!email) {
      return json({ error: "Email is required" }, 400);
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ── Find user by email ───────────────────────────────────
    const { data: user, error: userError } = await adminClient
      .from("profiles")
      .select("id, full_name, email")
      .eq("email", email.trim().toLowerCase())
      .single();

    if (userError || !user) {
      // Don't reveal whether email exists for security reasons
      return json({ ok: true, message: "If an account exists with this email, a password reset link has been sent." });
    }

    // ── Generate reset token (10-minute expiry) ──────────────
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { data: tokenRow, error: tokenErr } = await adminClient
      .from("reset_tokens")
      .insert({
        user_id: user.id,
        email: user.email,
        expires_at: expiresAt
      })
      .select("token")
      .single();

    if (tokenErr) {
      console.error("Failed to generate reset token:", tokenErr);
      return json({ error: "Failed to generate reset token" }, 500);
    }

    const resetLink = `${APP_URL}/#/reset-password?token=${tokenRow.token}`;

    // ── Send reset email via Brevo ───────────────────────────
    const emailHtml = buildResetEmail(user.full_name, resetLink);
    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: [{ email: user.email, name: user.full_name }],
        subject: "Password Reset - M88 Intern Tracker",
        htmlContent: emailHtml,
      }),
    });

    if (!brevoRes.ok) {
      const brevoErr = await brevoRes.json();
      console.error("Brevo error:", brevoErr);
      // Don't fail the whole request — token was created. Log but continue.
    }

    // Always return success message for security
    return json({ ok: true, message: "If an account exists with this email, a password reset link has been sent." });
  } catch (err) {
    console.error("Error:", err);
    return json({ error: err.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function buildResetEmail(fullName: string | null, link: string): string {
  const name = fullName || "there";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#1a1a2e;font-family:Arial,sans-serif;">
  <!-- HEADER -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px 0;">
    <tr>
      <td align="center">
        <img
          src="https://hhnvjkxsuhvtsoxzrahi.supabase.co/storage/v1/object/public/public-assets/logo.png"
          alt="Madison 88, Ltd."
          width="180"
          style="display:block;"
        />
      </td>
    </tr>
  </table>

  <!-- BODY -->
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td>
              <h2 style="color:#1a1a2e;margin-top:0;margin-bottom:12px;font-size:22px;">
                Password Reset Request
              </h2>
              <p style="color:#555;line-height:1.6;margin:0 0 24px;">
                Hi ${name},<br/><br/>
                We received a request to reset your password for your M88 Intern Productivity Tracker account.
                Click the button below to set a new password.
              </p>
              <p style="text-align:center;margin:32px 0;">
                <a href="${link}"
                   style="background-color:#1a1a2e;color:#ffffff;padding:14px 40px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;font-size:15px;">
                  Reset My Password
                </a>
              </p>
              <div style="background-color:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:14px 16px;margin:24px 0;">
                <p style="color:#7b5800;font-size:13px;margin:0;line-height:1.5;">
                  <strong>Important:</strong> This link expires in <strong>10 minutes</strong> and can only be used once.
                  If it has expired, you can request a new one from the login page.
                </p>
              </div>
              <p style="color:#888;font-size:13px;margin:24px 0 0;">
                If you did not request a password reset, you can safely ignore this email. Your password will not change.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- FOOTER -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px 0;margin-top:20px;">
    <tr>
      <td align="center">
        <img
          src="https://hhnvjkxsuhvtsoxzrahi.supabase.co/storage/v1/object/public/public-assets/logo.png"
          alt="Madison 88, Ltd."
          width="100"
          style="display:block;margin-bottom:10px;opacity:0.8;"
        />
        <p style="color:#1a1a2e;font-size:12px;margin:0;">
          &copy; 2026 Madison 88 Business Solutions Asia Inc. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
