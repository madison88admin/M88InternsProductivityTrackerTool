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
    // ── Verify caller is an authenticated admin ──────────────
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return json({ error: "Unauthorized: missing bearer token" }, 401);
    }

    // Decode JWT payload to extract user ID (avoid broken /auth/v1/user calls)
    let callerId: string;
    try {
      const parts = jwt.split(".");
      if (parts.length !== 3) throw new Error("bad format");
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(b64));
      callerId = payload.sub;
      if (!callerId) throw new Error("missing sub");
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return json({ error: "Unauthorized: token expired" }, 401);
      }
    } catch {
      return json({ error: "Unauthorized: invalid token" }, 401);
    }

    // Confirm user exists via admin API (uses service role — always works)
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: { user: authUser }, error: authError } =
      await adminClient.auth.admin.getUserById(callerId);
    if (authError || !authUser) {
      return json({ error: "Unauthorized: user not found" }, 401);
    }

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .single();

    if (callerProfile?.role !== "admin") {
      return json({ error: "Forbidden: admin role required" }, 403);
    }

    // ── Parse request body ───────────────────────────────────
    const {
      email,
      fullName,
      role,
      departmentId,
      locationId,
      phone,
      supervisorId,
      school,
      course,
      hoursRequired,
      ojtStartDate,
      isVoluntary,
    } = await req.json();

    if (!email || !fullName || !role) {
      return json({ error: "Missing required fields: email, fullName, role" }, 400);
    }

    // ── Create auth user (no magic link sent) ────────────────
    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });

    let userId: string;
    if (createErr) {
      // If the user already exists, look them up and resend the invite
      const msg = createErr.message.toLowerCase();
      const isAlreadyExists = msg.includes("already") || msg.includes("duplicate") || msg.includes("registered");
      if (!isAlreadyExists) return json({ error: createErr.message }, 400);

      const { data: existingProfile, error: lookupErr } = await adminClient
        .from("profiles")
        .select("id")
        .eq("email", email)
        .single();

      if (lookupErr || !existingProfile) {
        return json({ error: "User already exists but could not be found." }, 400);
      }
      userId = existingProfile.id;
    } else {
      userId = newUser.user.id;
    }

    // ── Update profiles row (created by DB trigger) ──────────
    const profileUpdates: Record<string, unknown> = {
      full_name: fullName,
      role,
      department_id: departmentId || null,
      location_id: locationId || null,
      phone: phone || null,
    };

    if (role === "intern") {
      if (supervisorId) profileUpdates.supervisor_id = supervisorId;
      profileUpdates.school = school || null;
      profileUpdates.course = course || null;
      profileUpdates.hours_required = hoursRequired ? parseFloat(hoursRequired) : null;
      profileUpdates.ojt_start_date = ojtStartDate || null;
      profileUpdates.is_voluntary = isVoluntary ?? false;
    }

    await adminClient.from("profiles").update(profileUpdates).eq("id", userId);

    // ── Generate invite token (5-minute expiry) ──────────────
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const { data: tokenRow, error: tokenErr } = await adminClient
      .from("invite_tokens")
      .insert({ user_id: userId, email, full_name: fullName, expires_at: expiresAt })
      .select("token")
      .single();

    if (tokenErr) return json({ error: "Failed to generate invite token" }, 500);

    const inviteLink = `${APP_URL}/#/set-password?token=${tokenRow.token}`;

    // ── Send invite email via Brevo ──────────────────────────
    const emailHtml = buildInviteEmail(fullName, inviteLink);
    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: [{ email, name: fullName }],
        subject: "You've been invited to M88 Intern Tracker",
        htmlContent: emailHtml,
      }),
    });

    if (!brevoRes.ok) {
      const brevoErr = await brevoRes.json();
      console.error("Brevo error:", brevoErr);
      // Don't fail the whole request — user was created. Log but continue.
    }

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

function buildInviteEmail(fullName: string, link: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;overflow:hidden;
                      box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4338ca,#6366f1);
                        padding:32px 40px;text-align:center;">
              <div style="display:inline-block;background:rgba(255,255,255,0.2);
                          border-radius:10px;padding:10px 20px;">
                <span style="font-size:24px;font-weight:900;color:#ffffff;
                             letter-spacing:-0.5px;">M88</span>
              </div>
              <p style="color:rgba(255,255,255,0.9);margin:12px 0 0;font-size:14px;">
                Intern Productivity Tracker
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:22px;">
                Welcome, ${fullName}!
              </h2>
              <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
                You've been invited to join the <strong>M88 Intern Productivity Tracker</strong>.
                Click the button below to set your password and activate your account.
              </p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${link}"
                   style="display:inline-block;background:linear-gradient(135deg,#4338ca,#6366f1);
                          color:#ffffff;text-decoration:none;padding:14px 40px;
                          border-radius:8px;font-weight:700;font-size:15px;
                          letter-spacing:0.3px;">
                  Set My Password
                </a>
              </div>
              <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;
                          padding:14px 18px;margin:24px 0;">
                <p style="margin:0;color:#7b5800;font-size:13px;line-height:1.5;">
                  <strong>Important:</strong> This link expires in
                  <strong>5 minutes</strong> and can only be used once.
                  If it has expired, please contact your administrator to resend the invitation.
                </p>
              </div>
              <p style="margin:24px 0 0;color:#888;font-size:13px;">
                If you did not expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f9;padding:20px 40px;text-align:center;
                        border-top:1px solid #eee;">
              <p style="margin:0;color:#aaa;font-size:12px;">
                M88 Intern Productivity Tracker &mdash; automated message, do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
