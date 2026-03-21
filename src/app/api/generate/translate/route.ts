import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveProvider } from "@/lib/providers";
import { SUPPORTED_LANGUAGES } from "@/lib/generation/regulatory-knowledge";

export const maxDuration = 120;

/**
 * POST /api/generate/translate
 *
 * Translates content pieces into target languages.
 * Creates new content_pieces with the translated content, linked to the
 * original via the topic_bank_ref field.
 *
 * Body: {
 *   companyId: string,
 *   weekId: string,
 *   targetLanguages: string[],  // e.g. ["fr", "de", "es"]
 *   pieceIds?: string[],        // specific pieces, or all in week
 *   createNewPieces: boolean,   // true = create new content_pieces, false = return translations only
 * }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    companyId,
    weekId,
    targetLanguages = [],
    pieceIds,
    createNewPieces = false,
  } = body;

  if (!companyId || !weekId || targetLanguages.length === 0) {
    return NextResponse.json(
      { error: "companyId, weekId, and targetLanguages required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // Fetch source pieces
  let query = supabase
    .from("content_pieces")
    .select("*")
    .eq("week_id", weekId)
    .order("sort_order");

  if (pieceIds && pieceIds.length > 0) {
    query = query.in("id", pieceIds);
  }

  const { data: pieces } = await query;
  if (!pieces || pieces.length === 0) {
    return NextResponse.json({ error: "No content pieces found" }, { status: 404 });
  }

  // Resolve Claude API key
  const provider = await resolveProvider(companyId, "content_generation");
  const apiKey = (provider?.credentials?.api_key as string) || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "No API key configured" }, { status: 400 });
  }

  const translations: {
    pieceId: string;
    originalTitle: string;
    language: string;
    languageName: string;
    translatedTitle: string;
    translatedBody: string;
    translatedFirstComment: string | null;
    newPieceId?: string;
  }[] = [];

  for (const lang of targetLanguages) {
    const langConfig = SUPPORTED_LANGUAGES.find((l) => l.code === lang);
    if (!langConfig) continue;

    for (const piece of pieces) {
      const system = `You are a professional healthcare marketing translator. Translate the following content from English into ${langConfig.name} (${langConfig.nativeName}).

CRITICAL TRANSLATION RULES:
1. Maintain the EXACT same tone, voice, and style in the target language
2. ${langConfig.spellingNotes}
3. Healthcare/medical terminology must use the correct local terms (not literal translations)
4. Preserve all formatting: line breaks, hashtags, markdown headers, bullet points
5. Do NOT translate: brand names, company names, product names, URLs, email addresses
6. Translate hashtags to their local language equivalents where natural hashtags exist
7. Adapt cultural references where necessary (e.g., NHS → local health system name)
8. Preserve bracketed asides — translate them but keep the brackets
9. Sign-offs should be translated naturally, not word-for-word
10. First comments (CTAs) should be translated but URLs kept as-is
11. For social posts: keep within similar character counts to the original
12. For long-form: anti-contraction rules do not apply in target languages — use natural register

CONTENT TYPE: ${piece.content_type} (${piece.post_type || "general"})

Respond with JSON (no code fences):
{
  "translatedTitle": "string",
  "translatedBody": "string (full translated content in markdown)",
  "translatedFirstComment": "string or null",
  "translatedHashtags": ["array", "of", "translated", "hashtags"],
  "translationNotes": "string (any notes about adaptation choices made)"
}`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          system,
          messages: [
            {
              role: "user",
              content: `Translate this content into ${langConfig.nativeName}:

TITLE: ${piece.title}

BODY:
${piece.markdown_body}

${piece.first_comment ? `FIRST COMMENT:\n${piece.first_comment}` : "No first comment."}`,
            },
          ],
        }),
      });

      if (!res.ok) {
        console.error(`[translate] API error for piece ${piece.id} → ${lang}`);
        continue;
      }

      const data = await res.json();
      const text = data.content?.find((c: { type: string }) => c.type === "text")?.text || "";
      const cleaned = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      try {
        const parsed = JSON.parse(cleaned);

        const translation = {
          pieceId: piece.id,
          originalTitle: piece.title,
          language: lang,
          languageName: langConfig.name,
          translatedTitle: parsed.translatedTitle,
          translatedBody: parsed.translatedBody,
          translatedFirstComment: parsed.translatedFirstComment || null,
          newPieceId: undefined as string | undefined,
        };

        // Optionally create a new content_piece for the translation
        if (createNewPieces) {
          const { data: newPiece } = await supabase
            .from("content_pieces")
            .insert({
              week_id: weekId,
              company_id: companyId,
              content_type: piece.content_type,
              title: `[${lang.toUpperCase()}] ${parsed.translatedTitle}`,
              markdown_body: parsed.translatedBody,
              first_comment: parsed.translatedFirstComment || null,
              word_count: parsed.translatedBody?.split(/\s+/).length || 0,
              post_type: piece.post_type,
              day_of_week: piece.day_of_week,
              scheduled_time: piece.scheduled_time,
              pillar: piece.pillar,
              audience_theme: piece.audience_theme,
              topic_bank_ref: `Translation (${lang.toUpperCase()}) of: ${piece.title}`,
              ecosystem_role: piece.ecosystem_role,
              cta_tier_used: piece.cta_tier_used,
              sort_order: (piece.sort_order || 0) + 100, // Place after originals
              approval_status: "pending",
            })
            .select()
            .single();

          if (newPiece) {
            translation.newPieceId = newPiece.id;
          }
        }

        translations.push(translation);
      } catch {
        console.error(`[translate] Parse error for piece ${piece.id} → ${lang}`);
      }
    }
  }

  return NextResponse.json({
    translatedCount: translations.length,
    targetLanguages,
    translations,
  });
}
