import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function requiredEnv(name: string): string {
  const v = Deno.env.get(name);
  return v ? v.trim() : "";
}

Deno.serve(async (req) => {
  // Allow GET for quick health checks
  if (req.method === "GET") return new Response("ok", { status: 200 });

  try {
    const PROJECT_URL = requiredEnv("PROJECT_URL");
    const SERVICE_ROLE_KEY = requiredEnv("SERVICE_ROLE_KEY");

    const EMAILJS_SERVICE_ID = requiredEnv("EMAILJS_SERVICE_ID");
    const EMAILJS_TEMPLATE_ID = requiredEnv("EMAILJS_TEMPLATE_ID");
    const EMAILJS_PUBLIC_KEY = requiredEnv("EMAILJS_PUBLIC_KEY");
    const NOTIFY_EMAILS = requiredEnv("NOTIFY_EMAILS");

    if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
      return new Response("Missing PROJECT_URL or SERVICE_ROLE_KEY", { status: 500 });
    }
    if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
      return new Response("Missing EmailJS secrets", { status: 500 });
    }

    const toEmails = NOTIFY_EMAILS.split(",").map((s) => s.trim()).filter(Boolean);
    if (toEmails.length === 0) {
      return new Response("NOTIFY_EMAILS not set", { status: 500 });
    }

    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

    // Count ALL rows in pass_transfer_requests (if you later add a status column,
    // we can filter to only pending)
    const { count, error } = await supabase
      .from("pass_transfer_requests")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error("DB error:", error);
      return new Response(`DB error: ${error.message}`, { status: 500 });
    }

    if (!count || count <= 0) return new Response("no pending", { status: 200 });

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
      return new Response(`EmailJS error: ${emailRes.status} ${emailText}`, { status: 500 });
    }

    return new Response("sent", { status: 200 });
  } catch (e) {
    console.error("weekly_pass_transfer_digest crashed:", e);
    return new Response(`error: ${String(e)}`, { status: 500 });
  }
});
