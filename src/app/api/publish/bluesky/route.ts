import { NextResponse } from "next/server";

/** Blocks legacy immediate Bluesky posts so every new post uses the approved publishing queue. */
export async function POST(_request: Request) {
  return NextResponse.json({ error: "Immediate Bluesky publishing is disabled. Approve the content and queue it from Publish." }, { status: 410 });
}
