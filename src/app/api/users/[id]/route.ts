import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/users/[id]
 * Admin only. Body may carry any of: role ("admin" | "client"),
 * company_id (uuid or null), can_publish (boolean).
 * Refuses to demote the last admin.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid user id" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const updates: { role?: "admin" | "client"; company_id?: string | null; can_publish?: boolean } = {};

  if ("role" in body) {
    if (body.role !== "admin" && body.role !== "client") {
      return NextResponse.json({ error: "role must be admin or client" }, { status: 400 });
    }
    updates.role = body.role;
  }
  if ("company_id" in body) {
    const c = body.company_id;
    if (c !== null && !(typeof c === "string" && UUID.test(c))) {
      return NextResponse.json({ error: "company_id must be a uuid or null" }, { status: 400 });
    }
    updates.company_id = c as string | null;
  }
  if ("can_publish" in body) {
    if (typeof body.can_publish !== "boolean") {
      return NextResponse.json({ error: "can_publish must be true or false" }, { status: 400 });
    }
    updates.can_publish = body.can_publish;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  const { data: target, error: targetError } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", id)
    .maybeSingle();
  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (updates.company_id) {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("id", updates.company_id)
      .maybeSingle();
    if (companyError) return NextResponse.json({ error: companyError.message }, { status: 500 });
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 400 });
  }

  if (updates.role === "client" && target.role === "admin") {
    const { data: admins, error: adminsError } = await supabase
      .from("users")
      .select("id")
      .eq("role", "admin");
    if (adminsError) return NextResponse.json({ error: adminsError.message }, { status: 500 });
    const others = (admins || []).filter((a: { id: string }) => a.id !== id);
    if (others.length === 0) {
      return NextResponse.json({ error: "This is the only administrator. Make someone else an administrator first." }, { status: 409 });
    }
  }

  const { data: row, error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", id)
    .select("*, company:companies(*)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: row });
}
