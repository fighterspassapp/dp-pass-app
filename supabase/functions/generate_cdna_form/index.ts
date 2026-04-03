/// <reference lib="deno.ns" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,apikey',
    'Access-Control-Expose-Headers': 'Content-Disposition',
  };

  if (req.method === 'OPTIONS') {
    return new Response('OK', { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const requestId = payload.requestId;

    if (!requestId || typeof requestId !== "number") {
      return new Response("Invalid request ID", { status: 400, headers: corsHeaders });
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let requestData = payload.request || null;

    // if the caller did not pass request data, look it up by ID
    if (!requestData) {
      const { data, error: fetchError } = await supabase
        .from("cdna_transfer_requests")
        .select("id, email, name, amount, created_at, date_of_use")
        .eq("id", requestId)
        .single();

      if (fetchError || !data) {
        const detail = fetchError ? fetchError.message : 'No request row';
        if (new URL(req.url).searchParams.get('debug') === 'request') {
          const envSummary = {
            SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
            hasServiceKey: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
          };
          return new Response(JSON.stringify({ requestId, envSummary, data, fetchError }, null, 2), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        return new Response(`CDNA request not found: ${detail}`, { status: 404, headers: corsHeaders });
      }

      requestData = data;
    }

    if (new URL(req.url).searchParams.get('debug') === 'request') {
      const envSummary = {
        SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
        hasServiceKey: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      };
      return new Response(JSON.stringify({ requestId, envSummary, requestData }, null, 2), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Extract class year from email
    const classMatch = requestData.email.match(/^c(\d+)/);
    const classYear = classMatch ? classMatch[1] : "";

    // Format dates
    const dateOfRequest = new Date(requestData.created_at).toLocaleDateString();
    const dateOfUse = requestData.date_of_use
      ? new Date(requestData.date_of_use).toLocaleDateString()
      : "";

    // Download form template from storage
    const { data: formData, error: storageError } = await supabase.storage
      .from("Form10PDF")
      .download("CDNA Form 10.pdf");

    if (storageError || !formData) {
      const message = storageError?.message
        ? `Form template not found: ${storageError.message}`
        : "Form template not found or empty";
      console.error(message, { storageError });
      return new Response(message, { status: 404, headers: corsHeaders });
    }

    // Load PDF document
    const pdfBytes = await formData.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Get form fields
    const form = pdfDoc.getForm();
    const allFieldNames = form.getFields().map((f) => f.getName());

    if (new URL(req.url).searchParams.get('debug') === 'fields') {
      return new Response(JSON.stringify({ fields: allFieldNames }, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const setFieldText = (name: string, text: string) => {
      const field = form.getFields().find((f) => f.getName() === name);
      if (!field) {
        console.warn(`Field not found: ${name}`);
        return false;
      }

      // PDF-lib might provide getters as text fields only.
      if ('setText' in field && typeof (field as any).setText === 'function') {
        (field as any).setText(text);
        return true;
      }

      if ('setDate' in field && typeof (field as any).setDate === 'function') {
        try {
          (field as any).setDate(new Date(text));
          return true;
        } catch {
          // fallback to setText
        }
      }

      if ('setValue' in field && typeof (field as any).setValue === 'function') {
        (field as any).setValue(text);
        return true;
      }

      console.warn(`No setter for field: ${name}`);
      return false;
    };

    // Fill form fields using your exact PDF field names
    // (set field names and text values per your user request)
    const fullName = requestData.name?.trim() || "";
    const [firstName, ...rest] = fullName.split(/\s+/);
    const lastName = rest.length > 0 ? rest[rest.length - 1] : firstName;

    // Convert 2-digit class from email to full year (c24 -> 2024)
    let classYearFull = classYear;
    if (classYear && classYear.length === 2) {
      classYearFull = `20${classYear}`;
    }

    // Date formatting for the message and field
    const requestDateText = dateOfRequest;
    const useDateText = requestData.date_of_use
      ? new Date(requestData.date_of_use).toLocaleDateString('en-GB')
      : '';

    const formatDDMM = (date: string) => {
      const d = new Date(date);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${dd} ${mm}`;
    };

    const useDateShort = requestData.date_of_use ? formatDDMM(requestData.date_of_use) : '';

    const reportText = `REPORT: Cadet '${lastName}', based on performance, has earned a Close Door No AMI on '${useDateShort}'.\nCadet Squadron AOCs/AMTs reserve all approval authority for incentives.`;

    try {
      setFieldText('topmostSubform[0].Page1[0].TextField1[2]', `${lastName}, ${firstName}`);
      setFieldText('topmostSubform[0].Page1[0].TextField1[0]', classYearFull);
      setFieldText('topmostSubform[0].Page1[0].DateField1[0]', requestDateText);
      setFieldText('topmostSubform[0].Page1[0].TextField1[6]', reportText);
    } catch (fieldError) {
      console.error('Error filling form fields:', fieldError);
      // Continue even if one field is missing
    }

    // No flatten to avoid potential PDF-lib issues in Edge runtime.
    let filledPdfBytes: Uint8Array;
    try {
      filledPdfBytes = await pdfDoc.save();
    } catch (saveError) {
      console.error("PDF save failed:", saveError);
      return new Response(`PDF save failed: ${saveError instanceof Error ? saveError.message : String(saveError)}`, {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ pdf: btoa(String.fromCharCode(...filledPdfBytes)) }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });

  } catch (error) {
    console.error("Error generating form:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`Internal server error: ${message}`, { status: 500, headers: corsHeaders });
  }
});