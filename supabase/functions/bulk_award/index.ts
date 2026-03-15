import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // For testing - return a simple response
  if (req.method === 'GET') {
    return new Response('Function is running', {
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    const PROJECT_URL = Deno.env.get("PROJECT_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY");

    console.log("PROJECT_URL:", PROJECT_URL ? "set" : "not set");
    console.log("SERVICE_ROLE_KEY:", SERVICE_ROLE_KEY ? "set" : "not set");

    if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
      return new Response("Server configuration error", {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY || Deno.env.get("ANON_KEY") || "");

    const body = await req.json();

    // Normalize and validate incoming payload.
    const type = String(body.type ?? '').trim().toLowerCase(); // pass or cdna
    const amount = Number(body.amount);
    const target = String(body.target ?? 'all').trim().toLowerCase(); // all or class

    console.log('bulk_award body:', body);
    console.log('resolved type:', type, 'amount:', amount, 'target:', target);

    if (!type || !amount) {
      return new Response("Missing parameters", {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (type !== 'pass' && type !== 'cdna') {
      return new Response(`Invalid type: ${type}`, {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // The users table is keyed by email (no numeric id column), so fetch email.
    const { data: allUsers, error } = await supabase.from("users").select("email, passes, cdnas");

    if (error) {
      console.log("Query error:", error);
      return new Response(`Database query error: ${error.message}`, {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // Filter users by class if target is not "all"
    let users = allUsers;
    if (target !== "all") {
      users = allUsers.filter(user => {
        // Parse class from email (e.g., "c27user@domain.com" -> "27")
        const classMatch = user.email.match(/^c(\d+)/);
        return classMatch && classMatch[1] === target;
      });
    }

    console.log(`Found ${users.length} users`);

    for (const u of users) {
      const update =
        type === "pass"
          ? { passes: (u.passes || 0) + amount }
          : { cdnas: (u.cdnas || 0) + amount };

      const { error: updateError } = await supabase.from("users").update(update).eq("email", u.email);

      if (updateError) {
        console.log("Update error:", updateError);
        return new Response(`Database update error: ${updateError.message}`, {
          status: 500,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        });
      }
    }

    return new Response("Bulk award complete", {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (err) {
    return new Response(String(err), {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }
});