/**
 * Plain text for Facebook and Instagram from the stored markdown body.
 * Unlike the LinkedIn text, hashtags are kept: on these networks the
 * hashtag block is part of the post.
 */
export function toSocialText(markdown: string): string {
  return (markdown || "")
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[\s(])\*(\S(?:.*?\S)?)\*(?=[\s).,!?:;]|$)/gm, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{2,6}\s+/gm, "") // markdown headings of ## and deeper; a leading single # is a hashtag
    .replace(/^>\s?/gm, "")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
