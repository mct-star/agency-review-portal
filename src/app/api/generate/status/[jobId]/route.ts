import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * GET /api/generate/status/[jobId]
 * Poll the status of a generation job.
 * Accessible by both admin and client (for their company's jobs).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  // Auth check (allow both admin and client)
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const {
    data: { user: authUser },
  } = await authClient.auth.getUser();

  if (!authUser) {
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

  return NextResponse.json({
    id: job.id,
    jobType: job.job_type,
    provider: job.provider,
    status: job.status,
    progress: job.progress,
    errorMessage: job.error_message,
    inputPayload: job.input_payload,
    outputPayload: job.output_payload,
    contentPieceId: job.content_piece_id,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    createdAt: job.created_at,
  });
}
