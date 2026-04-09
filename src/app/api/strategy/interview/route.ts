import { NextResponse } from "next/server";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveProvider } from "@/lib/providers";

// ── GET /api/strategy/interview?companyId=uuid ─────────────
// Returns the latest strategy session, audiences, and positioning for a company.

export async function GET(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  // Non-admin users can only access their own company
  if (profile.role !== "admin" && profile.company_id !== companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createServerSupabaseClient();

  try {
    // Fetch all three in parallel
    const [sessionRes, audiencesRes, positioningRes] = await Promise.all([
      supabase
        .from("strategy_sessions")
        .select("*")
        .eq("company_id", companyId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("strategy_audiences")
        .select("*")
        .eq("company_id", companyId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("strategy_positioning")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle(),
    ]);

    if (sessionRes.error) throw sessionRes.error;
    if (audiencesRes.error) throw audiencesRes.error;
    if (positioningRes.error) throw positioningRes.error;

    return NextResponse.json({
      session: sessionRes.data || null,
      audiences: audiencesRes.data || [],
      positioning: positioningRes.data || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load strategy session" },
      { status: 500 }
    );
  }
}

// ── POST /api/strategy/interview ───────────────────────────
// Upserts a strategy session, and syncs audiences/positioning when relevant steps are reached.

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    companyId?: string;
    step?: number;
    responses?: Record<string, unknown>;
    status?: "in_progress" | "completed";
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { companyId, step, responses, status } = body;

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }
  if (step === undefined || step === null) {
    return NextResponse.json({ error: "step required" }, { status: 400 });
  }
  if (!responses || typeof responses !== "object") {
    return NextResponse.json({ error: "responses object required" }, { status: 400 });
  }

  // Non-admin users can only modify their own company
  if (profile.role !== "admin" && profile.company_id !== companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createServerSupabaseClient();

  try {
    // Check for existing session
    const { data: existing, error: fetchErr } = await supabase
      .from("strategy_sessions")
      .select("*")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    let session;

    if (existing) {
      // Deep merge: merge new step responses into existing responses
      const mergedResponses = {
        ...(existing.responses as Record<string, unknown>),
        ...responses,
      };

      const updatePayload: Record<string, unknown> = {
        current_step: step,
        responses: mergedResponses,
        updated_at: new Date().toISOString(),
      };

      if (status) {
        updatePayload.status = status;
      }

      const { data: updated, error: updateErr } = await supabase
        .from("strategy_sessions")
        .update(updatePayload)
        .eq("id", existing.id)
        .select("*")
        .single();

      if (updateErr) throw updateErr;
      session = updated;
    } else {
      // Create new session
      const { data: created, error: createErr } = await supabase
        .from("strategy_sessions")
        .insert({
          company_id: companyId,
          current_step: step,
          status: status || "in_progress",
          responses,
        })
        .select("*")
        .single();

      if (createErr) throw createErr;
      session = created;
    }

    // Use admin client for side-effect writes (bypasses RLS)
    const adminSupabase = await createAdminSupabaseClient();

    // When step >= 2, sync strategy_audiences from responses["2"]
    if (step >= 2 && session.responses) {
      const stepTwoData = (session.responses as Record<string, unknown>)["2"] as
        | { audiences?: Array<Record<string, unknown>> }
        | undefined;

      if (stepTwoData?.audiences && Array.isArray(stepTwoData.audiences)) {
        // Delete existing audiences for this company, then re-insert
        await adminSupabase
          .from("strategy_audiences")
          .delete()
          .eq("company_id", companyId);

        const audienceRows = stepTwoData.audiences.map(
          (a: Record<string, unknown>, idx: number) => ({
            company_id: companyId,
            persona_name: (a.persona_name as string) || `Audience ${idx + 1}`,
            job_title: (a.job_title as string) || null,
            seniority: (a.seniority as string) || null,
            primary_problem: (a.primary_problem as string) || null,
            search_terms: (a.search_terms as string[]) || [],
            pain_points: (a.pain_points as string[]) || [],
            sort_order: idx,
          })
        );

        if (audienceRows.length > 0) {
          const { error: audienceErr } = await adminSupabase
            .from("strategy_audiences")
            .insert(audienceRows);
          if (audienceErr) throw audienceErr;
        }
      }
    }

    // When step >= 3, sync strategy_positioning from responses["3"]
    if (step >= 3 && session.responses) {
      const stepThreeData = (session.responses as Record<string, unknown>)["3"] as
        | Record<string, unknown>
        | undefined;

      if (stepThreeData) {
        const positioningPayload = {
          company_id: companyId,
          positioning_statement: (stepThreeData.positioning_statement as string) || null,
          differentiators: (stepThreeData.differentiators as string[]) || [],
          competitor_mistakes: (stepThreeData.competitor_mistakes as string) || null,
          transformation_before: (stepThreeData.transformation_before as string) || null,
          transformation_after: (stepThreeData.transformation_after as string) || null,
          storybrand_guide: (stepThreeData.storybrand_guide as string) || null,
        };

        // Upsert: try update first, insert if not found
        const { data: existingPos } = await adminSupabase
          .from("strategy_positioning")
          .select("id")
          .eq("company_id", companyId)
          .maybeSingle();

        if (existingPos) {
          const { error: posUpdateErr } = await adminSupabase
            .from("strategy_positioning")
            .update(positioningPayload)
            .eq("id", existingPos.id);
          if (posUpdateErr) throw posUpdateErr;
        } else {
          const { error: posInsertErr } = await adminSupabase
            .from("strategy_positioning")
            .insert(positioningPayload);
          if (posInsertErr) throw posInsertErr;
        }
      }
    }

    // When status = "completed", mark company strategy as complete
    if (status === "completed") {
      const { error: companyErr } = await adminSupabase
        .from("companies")
        .update({ strategy_completed: true })
        .eq("id", companyId);
      if (companyErr) throw companyErr;
    }

    return NextResponse.json({ session, saved: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save strategy session" },
      { status: 500 }
    );
  }
}
