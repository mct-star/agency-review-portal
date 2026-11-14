import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { DEFAULT_CADENCE, outsideRecipientsMessage, parseCadenceInput, recipientsOutsideCompany } from "@/lib/cadence/validate";

/**
 * GET /api/config/company-cadence?companyId=uuid
 * The company's posting cadence and reminder settings (defaults if none saved).
 * Authorises against the company before any read; the service-role query
 * filters on company_id.
 */
export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });

  const user = await requireCompanyUser(companyId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("company_cadence")
    .select("company_id, mode, reminder_hour, reminder_recipients")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? { company_id: companyId, ...DEFAULT_CADENCE } });
}

/**
 * PUT /api/config/company-cadence
 * Body: { companyId, mode, reminderHour, reminderRecipients }
 *
 * Each recipient must be the email of a users row in this company, so a
 * client cannot point reminders (with their review links) at an outside
 * address. An admin may add any address. The users lookup filters on
 * company_id.
 */
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const companyId = typeof body.companyId === "string" ? body.companyId : "";
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });

  const user = await requireCompanyUser(companyId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parseCadenceInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = await createAdminSupabaseClient();

  const isAdmin = (user as { role?: string }).role === "admin";
  if (!isAdmin && parsed.value.reminder_recipients.length > 0) {
    const { data: people, error: peopleError } = await supabase
      .from("users")
      .select("email")
      .eq("company_id", companyId);
    if (peopleError) return NextResponse.json({ error: peopleError.message }, { status: 500 });
    const outside = recipientsOutsideCompany(
      parsed.value.reminder_recipients,
      ((people || []) as Array<{ email: string | null }>).map((p) => p.email),
    );
    if (outside.length > 0) return NextResponse.json({ error: outsideRecipientsMessage(outside) }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("company_cadence")
    .upsert({ company_id: companyId, ...parsed.value }, { onConflict: "company_id" })
    .select("company_id, mode, reminder_hour, reminder_recipients")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
