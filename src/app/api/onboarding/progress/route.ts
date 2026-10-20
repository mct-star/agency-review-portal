/** Personal setup position for the existing company wizard, called by WorkspaceSetup after each step. */
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { canAccessCompany } from "@/lib/auth/permissions";
import { setupMetadata, stepsForPack, type SetupStep } from "@/lib/onboarding/progress";

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to save your setup progress." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some((key) => !["companyId", "step"].includes(key))
    || typeof body.companyId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.companyId)) {
    return NextResponse.json({ error: "Choose a valid company and setup step." }, { status: 400 });
  }
  const admin = await createAdminSupabaseClient();
  const { data: profile, error: profileError } = await admin.from("users").select("id, role, company_id").eq("id", user.id).maybeSingle();
  if (profileError) return NextResponse.json({ error: "Your account could not be checked. Try again." }, { status: 503 });
  if (!canAccessCompany(profile, body.companyId)) return NextResponse.json({ error: "You do not have access to this company." }, { status: 403 });
  const { data: company, error } = await admin.from("companies").select("id, post_pack").eq("id", body.companyId).maybeSingle();
  if (error) return NextResponse.json({ error: "The company could not be checked. Try again." }, { status: 503 });
  if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });
  if (!stepsForPack(company.post_pack === "hospitality").includes(body.step)) {
    return NextResponse.json({ error: "Choose a valid setup step." }, { status: 400 });
  }
  const { error: saveError } = await supabase.auth.updateUser({
    data: { workspace_setup: setupMetadata(user.user_metadata, body.companyId, body.step as SetupStep) },
  });
  if (saveError) return NextResponse.json({ error: "Your progress was not saved. Try again." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
