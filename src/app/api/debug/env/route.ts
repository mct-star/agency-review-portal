import { NextResponse } from "next/server";

/**
 * GET /api/debug/env — temporary diagnostic endpoint.
 * Lists which API keys are available (NOT the values, just true/false).
 * DELETE THIS FILE after debugging.
 */
export async function GET() {
  const keys = {
    GOOGLE_GEMINI_API_KEY: !!process.env.GOOGLE_GEMINI_API_KEY,
    Gemini: !!process.env.Gemini,
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    GEMINI: !!process.env.GEMINI,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    FAL_AI_API_KEY: !!process.env.FAL_AI_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  };

  return NextResponse.json({ keys, timestamp: new Date().toISOString() });
}
