/// <reference lib="deno.ns" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req) => {
  // Quick health check
  if (req.method === "GET") return new Response("ok", { status: 200 });

  try {
    await req.text();
    console.log("notify_cdna_request invoked; immediate CDNA emails are disabled in favor of daily digest.");
    return new Response("instant notifications disabled", { status: 200 });
  } catch (err) {
    console.error("notify_cdna_request crashed:", err);
    return new Response(`error: ${String(err)}`, { status: 500 });
  }
});
