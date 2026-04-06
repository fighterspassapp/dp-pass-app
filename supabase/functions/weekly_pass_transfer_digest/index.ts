import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function requiredEnv(name: string): string {
  const v = Deno.env.get(name);
  return v ? v.trim() : "";
}

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // Allow GET for quick health checks
  if (req.method === "GET") return new Response("ok", { status: 200 });

  try {
    const PROJECT_URL = requiredEnv("PROJECT_URL") || requiredEnv("SUPABASE_URL");
    const SERVICE_ROLE_KEY =
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY") || requiredEnv("SERVICE_ROLE_KEY");

    const EMAILJS_SERVICE_ID = requiredEnv("EMAILJS_SERVICE_ID");
    const EMAILJS_TEMPLATE_ID =
      requiredEnv("WEEKLY_EMAILJS_TEMPLATE_ID") || requiredEnv("EMAILJS_TEMPLATE_ID");
    const EMAILJS_PUBLIC_KEY = requiredEnv("EMAILJS_PUBLIC_KEY");
    const NOTIFY_EMAILS = requiredEnv("NOTIFY_EMAILS") || requiredEnv("WEEKLY_NOTIFY_EMAILS");

    if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse(500, {
        error: "missing_supabase_secrets",
        stage: "env_validation",
        required: ["PROJECT_URL", "SUPABASE_SERVICE_ROLE_KEY"],
      });
    }
    if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
      return jsonResponse(500, {
        error: "missing_emailjs_secrets",
        stage: "env_validation",
        missing: {
          EMAILJS_SERVICE_ID: !EMAILJS_SERVICE_ID,
          WEEKLY_EMAILJS_TEMPLATE_ID_or_EMAILJS_TEMPLATE_ID: !EMAILJS_TEMPLATE_ID,
          EMAILJS_PUBLIC_KEY: !EMAILJS_PUBLIC_KEY,
        },
      });
    }

    const toEmails = NOTIFY_EMAILS.split(",").map((s) => s.trim()).filter(Boolean);
    if (toEmails.length === 0) {
      return jsonResponse(500, {
        error: "missing_notify_emails",
        stage: "env_validation",
        required: ["NOTIFY_EMAILS or WEEKLY_NOTIFY_EMAILS"],
      });
    }

    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

    // Count ALL rows in pass_transfer_requests (if you later add a status column,
    // we can filter to only pending)
    const { count, error } = await supabase
      .from("pass_transfer_requests")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error("DB error:", error);
      return jsonResponse(500, {
        error: "db_error",
        stage: "db_count",
        message: error.message,
      });
    }

    if (!count || count <= 0) {
      return jsonResponse(200, { ok: true, stage: "done", message: "no pending" });
    }

    const details =
      `There ${count === 1 ? "is" : "are"} ${count} pass transfer request(s) ` +
      `awaiting FalconNet transfer.`;

    const emailRes = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          to_email: toEmails.join(","),
          event_title: "Weekly FalconNet Transfer Pending",
          details,
          count,
        },
      }),
    });

    const emailText = await emailRes.text();
    if (!emailRes.ok) {
      console.error("EmailJS error:", emailRes.status, emailText);
      return jsonResponse(500, {
        error: "emailjs_error",
        stage: "send_email",
        status: emailRes.status,
        response: emailText,
      });
    }

    return jsonResponse(200, { ok: true, stage: "done", message: "sent", count });
  } catch (e) {
    console.error("weekly_pass_transfer_digest crashed:", e);
    return jsonResponse(500, {
      error: "unhandled_exception",
      stage: "catch",
      message: String(e),
    });
  }
});
