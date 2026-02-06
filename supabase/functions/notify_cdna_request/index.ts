/// <reference lib="deno.ns" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type AnyObj = Record<string, any>;

/**
 * Supabase Database Webhooks can vary by configuration/version.
 * This function tries several common shapes to extract:
 * - event type (INSERT/UPDATE/DELETE)
 * - new row record
 */
function parseWebhookPayload(payload: AnyObj): { eventType: string; record: AnyObj } {
  // Shape A (what we originally assumed)
  // { type: "INSERT", record: {...} }
  if (typeof payload?.type === "string" && payload?.record && typeof payload.record === "object") {
    return { eventType: payload.type, record: payload.record as AnyObj };
  }

  // Shape B (common “new/old” format)
  // { eventType: "INSERT", new: {...}, old: {...} }
  if (typeof payload?.eventType === "string" && payload?.new && typeof payload.new === "object") {
    return { eventType: payload.eventType, record: payload.new as AnyObj };
  }

  // Shape C (sometimes: { event: "INSERT", record: {...} } )
  if (typeof payload?.event === "string" && payload?.record && typeof payload.record === "object") {
    return { eventType: payload.event, record: payload.record as AnyObj };
  }

  // Fallback: try common keys
  const guessType =
    (typeof payload?.event_type === "string" && payload.event_type) ||
    (typeof payload?.operation === "string" && payload.operation) ||
    (typeof payload?.action === "string" && payload.action) ||
    "";

  const guessRecord =
    (payload?.new && typeof payload.new === "object" && payload.new) ||
    (payload?.record && typeof payload.record === "object" && payload.record) ||
    (payload?.data && typeof payload.data === "object" && payload.data) ||
    {};

  return { eventType: guessType || "UNKNOWN", record: guessRecord as AnyObj };
}

function requiredEnv(name: string): string {
  const v = Deno.env.get(name);
  return v ? v.trim() : "";
}

Deno.serve(async (req) => {
  // Quick health check
  if (req.method === "GET") return new Response("ok", { status: 200 });

  try {
    const payload = (await req.json()) as AnyObj;

    // Helpful log: shows the incoming shape in Edge Function logs
    console.log("notify_cdna_request payload:", JSON.stringify(payload));

    const { eventType, record } = parseWebhookPayload(payload);

    // Only act on INSERT
    if (eventType !== "INSERT") {
      return new Response(`ignored (${eventType})`, { status: 200 });
    }

    // EmailJS secrets (must exist in Edge Functions → Secrets)
    const EMAILJS_SERVICE_ID = requiredEnv("EMAILJS_SERVICE_ID");
    const EMAILJS_TEMPLATE_ID = requiredEnv("EMAILJS_TEMPLATE_ID");
    const EMAILJS_PUBLIC_KEY = requiredEnv("EMAILJS_PUBLIC_KEY"); // EmailJS "Public Key" or "User ID"
    const NOTIFY_EMAILS = requiredEnv("NOTIFY_EMAILS");

    if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
      console.error("Missing EmailJS secrets", {
        EMAILJS_SERVICE_ID: !!EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID: !!EMAILJS_TEMPLATE_ID,
        EMAILJS_PUBLIC_KEY: !!EMAILJS_PUBLIC_KEY,
      });
      return new Response("Missing EmailJS secrets", { status: 500 });
    }

    const toEmails = NOTIFY_EMAILS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (toEmails.length === 0) {
      console.error("NOTIFY_EMAILS not set or empty");
      return new Response("NOTIFY_EMAILS not set", { status: 500 });
    }

    // Pull fields (adjust these to match your cdna_transfer_requests columns)
    const name = record.name ?? record.full_name ?? record.cadet_name ?? "";
    const email = record.email ?? record.user_email ?? "";
    const amount =
      record.amount ?? record.cdna_amount ?? record.cdnas ?? record.quantity ?? "";
    const reason = record.reason ?? record.notes ?? record.justification ?? "";
    const createdAt = record.created_at ?? record.createdAt ?? record.timestamp ?? "";

    const detailsLines = [
      name ? `Name: ${name}` : null,
      email ? `Email: ${email}` : null,
      amount !== "" ? `Amount: ${amount}` : null,
      reason ? `Reason: ${reason}` : null,
      createdAt ? `Created: ${createdAt}` : null,
      // You can add more fields here if your table has them (e.g., squadron, phone, etc.)
    ].filter(Boolean) as string[];

    const details =
      detailsLines.length > 0 ? detailsLines.join("\n") : JSON.stringify(record, null, 2);

    const emailRes = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          to_email: toEmails.join(","),
          event_title: "New CDNA Use Request",
          details,
        },
      }),
    });

    const emailText = await emailRes.text();

    if (!emailRes.ok) {
      console.error("EmailJS error:", emailRes.status, emailText);
      return new Response(`EmailJS error: ${emailRes.status} ${emailText}`, { status: 500 });
    }

    console.log("Email sent via EmailJS:", emailText);
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("notify_cdna_request crashed:", err);
    return new Response(`error: ${String(err)}`, { status: 500 });
  }
});
