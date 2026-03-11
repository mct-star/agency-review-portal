import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const { type, weekId, contentPieceId, comment } = body;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  // Get the acting user
  const authSupabase = createServerClient(
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
  } = await authSupabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: actingUser } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  if (!actingUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Get week info
  const { data: week } = weekId
    ? await supabase
        .from("weeks")
        .select("*, company:companies(*)")
        .eq("id", weekId)
        .single()
    : { data: null };

  // Get piece info
  const { data: piece } = contentPieceId
    ? await supabase
        .from("content_pieces")
        .select("*")
        .eq("id", contentPieceId)
        .single()
    : { data: null };

  // Determine recipient: if admin acted, notify client. If client acted, notify admin.
  let recipientQuery = supabase.from("users").select("*");

  if (actingUser.role === "admin") {
    // Notify client users for this company
    if (week?.company_id) {
      recipientQuery = recipientQuery
        .eq("company_id", week.company_id)
        .eq("role", "client");
    }
  } else {
    // Notify admin
    recipientQuery = recipientQuery.eq("role", "admin");
  }

  const { data: recipients } = await recipientQuery;

  // Build notification message
  let message = "";
  const actorName = actingUser.full_name || actingUser.email;

  switch (type) {
    case "content_ready":
      message = `New content ready for review: Week ${week?.week_number}${week?.title ? ` (${week.title})` : ""}`;
      break;
    case "piece_approved":
      message = `${actorName} approved: ${piece?.title}`;
      break;
    case "changes_requested":
      message = `${actorName} requested changes on: ${piece?.title}${comment ? ` — "${comment}"` : ""}`;
      break;
    case "comment_added":
      message = `${actorName} commented on: ${piece?.title}${comment ? ` — "${comment}"` : ""}`;
      break;
    default:
      message = `Action by ${actorName}`;
  }

  // Create notification records
  for (const recipient of recipients || []) {
    await supabase.from("notifications").insert({
      recipient_user_id: recipient.id,
      type,
      week_id: weekId || null,
      content_piece_id: contentPieceId || null,
      message,
    });
  }

  // TODO: Send email via Resend (Phase 5)

  return NextResponse.json({ ok: true });
}
