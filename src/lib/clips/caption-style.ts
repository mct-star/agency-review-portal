export type CaptionStyle = "auto" | "editorial" | "chest";

export const CAPTION_STYLE_OPTIONS: { value: CaptionStyle; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "editorial", label: "Editorial" },
  { value: "chest", label: "Chest" },
];

/** Body for POST /api/admin/clips/run. Auto sends no caption_style key, so the request is as it was before the picker. */
export function buildRunBody(
  pieceId: string,
  captionStyle: CaptionStyle
): { contentPieceId: string; caption_style?: CaptionStyle } {
  return captionStyle === "auto"
    ? { contentPieceId: pieceId }
    : { contentPieceId: pieceId, caption_style: captionStyle };
}

function labelFor(value: string): string {
  return CAPTION_STYLE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** What a finished render shows, read from the verify record the handler writes. Null for older renders. */
export function captionStyleLabel(
  verify: { captionStyle?: string; effectiveStyle?: string } | null
): string | null {
  if (!verify?.captionStyle) return null;
  const chosen = labelFor(verify.captionStyle);
  const used = verify.effectiveStyle ? labelFor(verify.effectiveStyle) : null;
  return used && used !== chosen ? `Captions: ${chosen} (used ${used})` : `Captions: ${chosen}`;
}
