import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * GET /api/compliance/documents?companyId=xxx
 *
 * List all compliance documents for a company.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const profile = await requireCompanyUser(companyId);
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminSupabaseClient();
  const { data: documents, error } = await supabase
    .from("company_compliance_documents")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ documents: documents || [] });
}

/**
 * POST /api/compliance/documents
 *
 * Upload a new compliance document. Accepts multipart form data
 * with the file and metadata.
 *
 * FormData fields:
 * - file: File (PDF, DOCX, TXT, CSV)
 * - companyId: string
 * - name: string
 * - category: string
 * - description?: string
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const companyId = formData.get("companyId") as string;
  const name = formData.get("name") as string;
  const category = formData.get("category") as string;
  const description = formData.get("description") as string | null;

  if (!file || !companyId || !name || !category) {
    return NextResponse.json(
      { error: "file, companyId, name, and category are required" },
      { status: 400 }
    );
  }

  const profile = await requireCompanyUser(companyId);
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Validate file type
  const allowedTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/csv",
    "application/json",
  ];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type. Upload PDF, DOCX, TXT, or CSV." },
      { status: 400 }
    );
  }

  // Size limit: 10MB
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 10MB." },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // Upload to Supabase Storage
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `compliance-docs/${companyId}/${timestamp}-${sanitizedName}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from("content-assets")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    console.error("[compliance-docs] Upload failed:", uploadError);
    return NextResponse.json(
      { error: "File upload failed" },
      { status: 500 }
    );
  }

  const { data: urlData } = supabase.storage
    .from("content-assets")
    .getPublicUrl(storagePath);

  // Extract text from the document (basic extraction for TXT/CSV)
  let extractedText: string | null = null;
  let extractionStatus = "pending";

  if (file.type === "text/plain" || file.type === "text/csv") {
    extractedText = new TextDecoder().decode(buffer);
    extractionStatus = "complete";
  } else if (file.type === "application/json") {
    try {
      extractedText = JSON.stringify(JSON.parse(new TextDecoder().decode(buffer)), null, 2);
      extractionStatus = "complete";
    } catch {
      extractionStatus = "failed";
    }
  } else if (file.type === "application/pdf") {
    // PDF extraction using pdf-parse
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const pdfData = await pdfParse(Buffer.from(buffer));
      extractedText = pdfData.text?.trim() || null;
      extractionStatus = extractedText ? "complete" : "failed";
    } catch (pdfErr) {
      console.warn("[compliance-docs] PDF extraction failed:", pdfErr);
      extractionStatus = "failed";
    }
  } else if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.name?.endsWith(".docx")
  ) {
    // DOCX extraction using mammoth
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
      extractedText = result.value?.trim() || null;
      extractionStatus = extractedText ? "complete" : "failed";
    } catch (docxErr) {
      console.warn("[compliance-docs] DOCX extraction failed:", docxErr);
      extractionStatus = "failed";
    }
  }

  // Save record
  const { data: doc, error: insertError } = await supabase
    .from("company_compliance_documents")
    .insert({
      company_id: companyId,
      name,
      description: description || null,
      category,
      file_url: urlData.publicUrl,
      file_name: file.name,
      file_size_bytes: file.size,
      mime_type: file.type,
      extracted_text: extractedText,
      extraction_status: extractionStatus,
      uploaded_by: profile.id || null,
    })
    .select()
    .single();

  if (insertError) {
    console.error("[compliance-docs] Insert failed:", insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ document: doc });
}

/**
 * DELETE /api/compliance/documents
 *
 * Delete a compliance document.
 * Body: { documentId: string, companyId: string }
 */
export async function DELETE(request: Request) {
  const body = await request.json();
  const { documentId, companyId } = body;

  if (!documentId || !companyId) {
    return NextResponse.json(
      { error: "documentId and companyId required" },
      { status: 400 }
    );
  }

  const profile = await requireCompanyUser(companyId);
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminSupabaseClient();

  const { error } = await supabase
    .from("company_compliance_documents")
    .delete()
    .eq("id", documentId)
    .eq("company_id", companyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
