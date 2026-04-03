/// <reference lib="deno.ns" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const { toEmail, cadetName, dateOfUse } = await req.json();

    if (!toEmail) {
      return new Response('Missing required field: toEmail', { status: 400, headers: corsHeaders });
    }

    const EMAILJS_SERVICE_ID = Deno.env.get('EMAILJS_SERVICE_ID');
    const EMAILJS_FORM_TEMPLATE_ID = Deno.env.get('EMAILJS_FORM_TEMPLATE_ID');
    const EMAILJS_PUBLIC_KEY = Deno.env.get('EMAILJS_PUBLIC_KEY');

    if (!EMAILJS_SERVICE_ID || !EMAILJS_FORM_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
      console.error('Missing EmailJS secrets', {
        EMAILJS_SERVICE_ID: !!EMAILJS_SERVICE_ID,
        EMAILJS_FORM_TEMPLATE_ID: !!EMAILJS_FORM_TEMPLATE_ID,
        EMAILJS_PUBLIC_KEY: !!EMAILJS_PUBLIC_KEY,
      });
      return new Response('Missing EmailJS secrets (EMAILJS_FORM_TEMPLATE_ID required)', { status: 500, headers: corsHeaders });
    }

    const emailRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_FORM_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          to_email: toEmail,
          cadet_name: cadetName ?? '',
          date_of_use: dateOfUse ?? '',
        },
      }),
    });

    const emailText = await emailRes.text();

    if (!emailRes.ok) {
      console.error('EmailJS error:', emailRes.status, emailText);
      return new Response(`EmailJS error: ${emailRes.status} ${emailText}`, { status: 500, headers: corsHeaders });
    }

    console.log('Form email sent to', toEmail, ':', emailText);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('send_cdna_form_email crashed:', err);
    return new Response(`Error: ${String(err)}`, { status: 500, headers: corsHeaders });
  }
});
