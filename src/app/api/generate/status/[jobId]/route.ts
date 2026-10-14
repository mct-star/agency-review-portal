import { NextResponse } from "next/server";
import { createAdminSupabaseClient, getSignedInProfile } from "@/lib/supabase/admin";
import { canAccessCompany } from "@/lib/auth/permissions";

/**
 * GET /api/generate/status/[jobId]
 * Poll the status of a generation job.
 * Admins see any job; a company user sees only their own company's jobs.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const profile = await getSignedInProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminSupabaseClient();

  const { data: job, error } = await supabase
    .from("content_generation_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return NextResponse.json(
      { error: "Job not found" },
      { status: 404 }
    );
  }

  if (profile.role !== "admin" && !canAccessCompany(profile, job.company_id)) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Which provider ran, and the raw failure text, are for staff. A client
  // gets a plain sentence; the details stay in the job row.
  const isAdmin = profile.role === "admin";
  const errorMessage = job.error_message
    ? isAdmin
      ? job.error_message
      : "The job failed. AGENCY has the details."
    : job.error_message;

  return NextResponse.json({
    id: job.id,
    jobType: job.job_type,
    ...(isAdmin ? { provider: job.provider } : {}),
    status: job.status,
    progress: job.progress,
    errorMessage,
    inputPayload: job.input_payload,
    outputPayload: job.output_payload,
    contentPieceId: job.content_piece_id,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    createdAt: job.created_at,
  });
}
