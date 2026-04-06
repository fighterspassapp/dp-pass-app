import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  return value ? value.trim() : "";
}

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "GET") return new Response("ok", { status: 200 });

  try {
    const PROJECT_URL = requiredEnv("PROJECT_URL") || requiredEnv("SUPABASE_URL");
    const SERVICE_ROLE_KEY =
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY") || requiredEnv("SERVICE_ROLE_KEY");

    const EMAILJS_SERVICE_ID = requiredEnv("EMAILJS_SERVICE_ID");
    const EMAILJS_TEMPLATE_ID =
      requiredEnv("CDNA_EMAILJS_TEMPLATE_ID") || requiredEnv("EMAILJS_TEMPLATE_ID");
    const EMAILJS_PUBLIC_KEY = requiredEnv("EMAILJS_PUBLIC_KEY");
    const NOTIFY_EMAILS = requiredEnv("CDNA_NOTIFY_EMAILS") || requiredEnv("NOTIFY_EMAILS");

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
          CDNA_EMAILJS_TEMPLATE_ID_or_EMAILJS_TEMPLATE_ID: !EMAILJS_TEMPLATE_ID,
          EMAILJS_PUBLIC_KEY: !EMAILJS_PUBLIC_KEY,
        },
      });
    }

    const toEmails = NOTIFY_EMAILS.split(",").map((s) => s.trim()).filter(Boolean);
    if (toEmails.length === 0) {
      return jsonResponse(500, {
        error: "missing_notify_emails",
        stage: "env_validation",
        required: ["CDNA_NOTIFY_EMAILS or NOTIFY_EMAILS"],
      });
    }

    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

    const { data: requests, error } = await supabase
      .from("cdna_transfer_requests")
      .select("id, name, email, amount, date_of_use, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("DB error:", error);
      return jsonResponse(500, {
        error: "db_error",
        stage: "db_fetch",
        message: error.message,
      });
    }

    const pendingRequests = requests ?? [];
    if (pendingRequests.length === 0) {
      return jsonResponse(200, { ok: true, stage: "done", message: "no pending" });
    }

    const detailsLines = pendingRequests.flatMap((request, index) => {
      const dateOfUse = request.date_of_use
        ? new Date(`${request.date_of_use}T12:00:00`).toLocaleDateString()
        : "Not provided";

      return [
        `${index + 1}. ${request.name ?? "Unknown name"} (${request.email})`,
        `Amount: ${request.amount}`,
        `Date of Use: ${dateOfUse}`,
        `Requested: ${new Date(request.created_at).toLocaleString()}`,
        "",
      ];
    });

    const details =
      `There ${pendingRequests.length === 1 ? "is" : "are"} ${pendingRequests.length} pending CDNA request(s).\n\n` +
      detailsLines.join("\n").trim();

    const emailRes = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          to_email: toEmails.join(","),
          event_title: "Daily CDNA Request Digest",
          details,
          count: pendingRequests.length,
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

    return jsonResponse(200, {
      ok: true,
      stage: "done",
      message: "sent",
      count: pendingRequests.length,
    });
  } catch (error) {
    console.error("daily_cdna_transfer_digest crashed:", error);
    return jsonResponse(500, {
      error: "unhandled_exception",
      stage: "catch",
      message: String(error),
    });
  }
});