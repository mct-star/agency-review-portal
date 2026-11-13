/**
 * Copy-ready pieces of a LinkedIn newsletter article. The article stays a
 * manual publish (12 Nov 2026): this builds the three things Michael pastes
 * into the newsletter editor, each on its own. The body is real HTML
 * (headings, paragraphs, lists, bold, italic, links) so a rich paste into the
 * editor keeps its structure, plus a plain-text fallback.
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(raw: string): string {
  let s = escapeHtml(raw);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, href: string) =>
    /^(https?:\/\/|mailto:)/i.test(href) ? `<a href="${href}">${text}</a>` : text);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return s;
}

export function markdownToNewsletterHtml(markdown: string): string {
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`);
    list = null;
  };

  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (heading) {
      flushPara(); flushList();
      out.push(`<h${heading[1].length}>${inline(heading[2].trim())}</h${heading[1].length}>`);
    } else if (bullet || numbered) {
      flushPara();
      const tag = bullet ? "ul" : "ol";
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push((bullet || numbered)![1]);
    } else if (line.trim() === "") {
      flushPara(); flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara(); flushList();
  return out.join("");
}

const stripTags = (html: string) =>
  html.replace(/<\/(p|h[1-6]|ul|ol)>/g, "\n\n").replace(/<\/li>/g, "\n").replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n").trim();

export interface NewsletterCopy {
  title: string;
  bodyHtml: string;
  bodyText: string;
  imageUrl: string | null;
}

export function buildNewsletterCopy(piece: {
  title: string | null;
  markdown_body: string | null;
  imageUrl: string | null;
}): NewsletterCopy {
  const body = piece.markdown_body || "";
  const first = /^\s*#\s+(.*)$/m.exec(body);
  const title = (piece.title || first?.[1] || "").trim();
  // The title has its own field in the editor, so a leading H1 that repeats it is dropped.
  const withoutTitle = first && first[1].trim() === title ? body.replace(first[0], "") : body;
  const bodyHtml = markdownToNewsletterHtml(withoutTitle);
  return { title, bodyHtml, bodyText: stripTags(bodyHtml), imageUrl: piece.imageUrl };
}
