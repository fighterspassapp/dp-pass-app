import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  return value ? value.trim() : "";
}

Deno.serve(async (req) => {
  if (req.method === "GET") return new Response("ok", { status: 200 });

  try {
    const PROJECT_URL = requiredEnv("PROJECT_URL");
    const SERVICE_ROLE_KEY = requiredEnv("SERVICE_ROLE_KEY");

    const EMAILJS_SERVICE_ID = requiredEnv("EMAILJS_SERVICE_ID");
    const EMAILJS_TEMPLATE_ID = requiredEnv("CDNA_EMAILJS_TEMPLATE_ID") || requiredEnv("EMAILJS_TEMPLATE_ID");
    const EMAILJS_PUBLIC_KEY = requiredEnv("EMAILJS_PUBLIC_KEY");
    const NOTIFY_EMAILS = requiredEnv("CDNA_NOTIFY_EMAILS");

    if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
      return new Response("Missing PROJECT_URL or SERVICE_ROLE_KEY", { status: 500 });
    }
    if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
      return new Response("Missing EmailJS secrets", { status: 500 });
    }

    const toEmails = NOTIFY_EMAILS.split(",").map((s) => s.trim()).filter(Boolean);
    if (toEmails.length === 0) {
      return new Response("CDNA_NOTIFY_EMAILS not set", { status: 500 });
    }

    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

    const { data: requests, error } = await supabase
      .from("cdna_transfer_requests")
      .select("id, name, email, amount, date_of_use, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("DB error:", error);
      return new Response(`DB error: ${error.message}`, { status: 500 });
    }

    const pendingRequests = requests ?? [];
    if (pendingRequests.length === 0) return new Response("no pending", { status: 200 });

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
      return new Response(`EmailJS error: ${emailRes.status} ${emailText}`, { status: 500 });
    }

    return new Response("sent", { status: 200 });
  } catch (error) {
    console.error("daily_cdna_transfer_digest crashed:", error);
    return new Response(`error: ${String(error)}`, { status: 500 });
  }
});