/**
 * The four reminder emails and their follow-ups, as templates.
 *
 * Pure: typed inputs in, { subject, preview, html, text } out. Nothing here
 * sends an email, reads the database or touches the network; the cron that
 * decides what is due (src/lib/reminders/due.ts) calls these and sends.
 *
 * The wording is the approved copy, held once as blocks and rendered to both
 * HTML and plain text, so the two cannot drift apart. Every button is a plain
 * link to a page. Nothing is approved, deployed or marked by following one.
 *
 * Kind names match ReminderKind in src/lib/reminders/due.ts. capture_due has
 * no template here yet.
 */
import type { ReminderKind } from "@/types/database";
import { escapeHtml } from "../invite-email";

export type ReminderEmailKind = Exclude<ReminderKind, "capture_due">;

export const REMINDER_EMAIL_KINDS: readonly ReminderEmailKind[] = ["week_ready", "deploy_week", "todays_post", "manual_publish"];

export interface RenderedReminderEmail {
  subject: string;
  /** The inbox preview line. Also placed, hidden, at the top of the HTML. */
  preview: string;
  html: string;
  text: string;
  buttonLabel: string;
  buttonUrl: string;
}

interface Common {
  /** Blank or missing renders the greeting "Hello,". */
  firstName?: string | null;
  /** True for the single follow-up, false for the first send. */
  isFollowUp: boolean;
}

export interface WeekReadyInput extends Common {
  /** Rendered with no hyphens, dashes or colons, for example "10 to 16 November". */
  weekLabel: string;
  /** One line of counts by content type, already worded by the caller. */
  countsByType: string;
  /** First send only. Blank renders nothing. */
  recordingsNeeded?: string | null;
  /**
   * Follow-up only: the earliest post date in the week as a plain date, for
   * example "10 November", with no hyphens, dashes or colons. Blank or missing
   * leaves out the sentence that names it.
   */
  firstPostDate?: string | null;
  reviewUrl: string;
}

/** The steps Deploy week leaves to a person. Anything else is not mentioned. */
export type DeployManualStep = "blog" | "scheduler" | "newsletter";

const MANUAL_STEP_ORDER: readonly DeployManualStep[] = ["blog", "scheduler", "newsletter"];

const MANUAL_STEP_LABEL: Record<DeployManualStep, string> = {
  blog: "Publishing the blog post",
  scheduler: "Uploading the scheduling file",
  newsletter: "Publishing the newsletter",
};

export interface DeployWeekInput extends Common {
  weekLabel: string;
  /**
   * The manual steps this week really has, built by the caller from the facts
   * the deploy page uses. Order and repeats do not matter. Empty leaves the
   * list (first email) and the sentence (follow-up) out.
   */
  manualSteps: readonly DeployManualStep[];
  deployUrl: string;
}

export interface TodaysPostInput extends Common {
  /** For example "Friday 14 November". */
  postDate: string;
  /** Rendered with no hyphens, dashes or colons. */
  postTitle: string;
  /** Capped at 40 words. */
  postPreview: string;
  postUrl: string;
}

export interface ManualPublishInput extends Common {
  newsletterTitle: string;
  publishUrl: string;
}

export type ReminderEmailInput =
  | ({ kind: "week_ready" } & WeekReadyInput)
  | ({ kind: "deploy_week" } & DeployWeekInput)
  | ({ kind: "todays_post" } & TodaysPostInput)
  | ({ kind: "manual_publish" } & ManualPublishInput);

// ─────────────────────────────────────────────
// Template rules
// ─────────────────────────────────────────────

/** Words allowed in a post preview. */
export const POST_PREVIEW_MAX_WORDS = 40;

/**
 * Renders a label with no hyphens, dashes or colons. A range between numbers
 * becomes "to" ("10-16 November" gives "10 to 16 November"); any other
 * hyphen, dash or colon becomes a space.
 */
export function tidyLabel(value: string): string {
  return value
    .replace(/(\d)\s*[-‐-―−]\s*(\d)/g, "$1 to $2")
    .replace(/[-‐-―−:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Collapses whitespace and keeps the first `max` words, adding an ellipsis when it cut. */
export function capWords(value: string, max: number = POST_PREVIEW_MAX_WORDS): string {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(" ");
  return `${words.slice(0, max).join(" ")}…`;
}

function greeting(firstName: string | null | undefined): string {
  const name = firstName?.replace(/\s+/g, " ").trim();
  return name ? `Hi ${name},` : "Hello,";
}

function nonBlank(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : null;
}

/** A required text field: trimmed, whitespace collapsed, and never blank. */
function requiredText(value: string | null | undefined, what: string): string {
  const text = nonBlank(value);
  if (!text) throw new Error(`Reminder email needs ${what}`);
  return text;
}

/** One paragraph block, or none when the text is blank, so no empty paragraph is ever rendered. */
function paragraph(value: string | null | undefined): Block[] {
  const text = nonBlank(value);
  return text ? [{ type: "p", text }] : [];
}

/** The chosen manual steps in their fixed order, each once. */
function orderedSteps(steps: readonly DeployManualStep[]): DeployManualStep[] {
  return MANUAL_STEP_ORDER.filter((step) => steps.includes(step));
}

function joinWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function checkedUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Reminder email button needs a full http or https link");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Reminder email button needs a full http or https link");
  }
  return url;
}

// ─────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────

type Block = { type: "p"; text: string } | { type: "list"; lead: string; items: string[] };

interface Spec {
  subject: string;
  preview: string;
  firstName: string | null | undefined;
  blocks: Block[];
  buttonLabel: string;
  buttonUrl: string;
}

function toText(spec: Spec): string {
  const parts = [greeting(spec.firstName)];
  for (const block of spec.blocks) {
    parts.push(block.type === "p" ? block.text : [block.lead, ...block.items.map((i) => `- ${i}`)].join("\n"));
  }
  parts.push(`${spec.buttonLabel}\n${spec.buttonUrl}`);
  return parts.join("\n\n");
}

/** White text on this button colour has a contrast ratio of 5.9 to 1. */
export const BUTTON_COLOUR = "#0369a1";

const P_STYLE = "margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;";

function toHtml(spec: Spec): string {
  const body = spec.blocks
    .map((block) => {
      if (block.type === "p") return `<p style="${P_STYLE}">${escapeHtml(block.text)}</p>`;
      const items = block.items.map((i) => `<li style="margin:0 0 4px;">${escapeHtml(i)}</li>`).join("");
      return `<p style="margin:0 0 8px;color:#4b5563;font-size:15px;line-height:1.6;">${escapeHtml(block.lead)}</p>` +
        `<ul style="margin:0 0 16px;padding-left:20px;color:#4b5563;font-size:15px;line-height:1.6;">${items}</ul>`;
    })
    .join("\n              ");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(spec.preview)}</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding:40px;">
              <p style="${P_STYLE}">${escapeHtml(greeting(spec.firstName))}</p>
              ${body}
              <table cellpadding="0" cellspacing="0" style="margin:16px 0 0;">
                <tr>
                  <td style="background-color:${BUTTON_COLOUR};border-radius:8px;padding:14px 28px;">
                    <a href="${escapeHtml(spec.buttonUrl)}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;display:block;">
                      ${escapeHtml(spec.buttonLabel)}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function render(spec: Spec): RenderedReminderEmail {
  return {
    subject: spec.subject,
    preview: spec.preview,
    html: toHtml(spec),
    text: toText(spec),
    buttonLabel: spec.buttonLabel,
    buttonUrl: spec.buttonUrl,
  };
}

const LAST_REMINDER = "This is the last reminder we will send.";

// ─────────────────────────────────────────────
// The four reminders
// ─────────────────────────────────────────────

export function renderWeekReady(input: WeekReadyInput): RenderedReminderEmail {
  const week = tidyLabel(input.weekLabel);
  const buttonUrl = checkedUrl(input.reviewUrl);
  const counts = paragraph(input.countsByType);

  if (input.isFollowUp) {
    const firstPost = nonBlank(input.firstPostDate ? tidyLabel(input.firstPostDate) : null);
    const closing = `${firstPost ? `Your first post is due on ${firstPost}. ` : ""}Nothing is published without your approval, so anything not approved will wait.`;
    return render({
      subject: `Reminder about ${week}`,
      preview: "Nothing goes out without your approval.",
      firstName: input.firstName,
      blocks: [
        { type: "p", text: `Your content for ${week} is still waiting for review. ${LAST_REMINDER}` },
        ...counts,
        { type: "p", text: closing },
      ],
      buttonLabel: "Review the week",
      buttonUrl,
    });
  }

  return render({
    subject: `Your content for ${week} is ready`,
    preview: "Review, adjust and approve in one sitting.",
    firstName: input.firstName,
    blocks: [
      { type: "p", text: `Your content for ${week} is made and ready to review.` },
      ...counts,
      ...paragraph(input.recordingsNeeded),
      { type: "p", text: "Read each piece, change what you want and approve it when you are happy. It should take one sitting." },
    ],
    buttonLabel: "Review the week",
    buttonUrl,
  });
}

export function renderDeployWeek(input: DeployWeekInput): RenderedReminderEmail {
  const week = tidyLabel(input.weekLabel);
  const buttonUrl = checkedUrl(input.deployUrl);
  const steps = orderedSteps(input.manualSteps);

  if (input.isFollowUp) {
    const remaining = joinWords(steps.map((step) => MANUAL_STEP_LABEL[step].replace(/^./, (c) => c.toLowerCase())));
    return render({
      subject: `Reminder to deploy ${week}`,
      preview: "Your approved content is ready when you are.",
      firstName: input.firstName,
      blocks: [
        { type: "p", text: `Your approved content for ${week} has not been deployed yet. ${LAST_REMINDER}` },
        ...paragraph(steps.length ? `Once you deploy, the manual steps remain: ${remaining}.` : null),
      ],
      buttonLabel: "Open the deploy page",
      buttonUrl,
    });
  }

  return render({
    subject: `Your content for ${week} is approved and ready to deploy`,
    preview: "Everything is approved. Deploy when you are ready.",
    firstName: input.firstName,
    blocks: [
      { type: "p", text: `Everything for ${week} is approved. The button opens the deploy page, where you can deploy the week.` },
      ...(steps.length ? [{ type: "list", lead: "These steps stay manual:", items: steps.map((step) => MANUAL_STEP_LABEL[step]) } as Block] : []),
    ],
    buttonLabel: "Open the deploy page",
    buttonUrl,
  });
}

export function renderTodaysPost(input: TodaysPostInput): RenderedReminderEmail {
  const title = requiredText(tidyLabel(input.postTitle), "a post title");
  const postDate = requiredText(input.postDate, "a post date");
  const buttonUrl = checkedUrl(input.postUrl);
  const preview = paragraph(capWords(input.postPreview));

  if (input.isFollowUp) {
    return render({
      subject: `Reminder about your post for ${postDate}`,
      preview: title,
      firstName: input.firstName,
      blocks: [
        { type: "p", text: `Your post for ${postDate} is still waiting. ${LAST_REMINDER}` },
        ...preview,
        { type: "p", text: "It will not go out without your approval." },
      ],
      buttonLabel: "Review today's post",
      buttonUrl,
    });
  }

  return render({
    subject: "Today's post is waiting for you",
    preview: title,
    firstName: input.firstName,
    blocks: [
      { type: "p", text: `Your post for ${postDate} is ready.` },
      ...preview,
      { type: "p", text: "The button opens the post, where you can edit and approve it." },
    ],
    buttonLabel: "Review today's post",
    buttonUrl,
  });
}

export function renderManualPublish(input: ManualPublishInput): RenderedReminderEmail {
  const newsletterTitle = requiredText(input.newsletterTitle, "a newsletter title");
  const buttonUrl = checkedUrl(input.publishUrl);

  if (input.isFollowUp) {
    return render({
      subject: "Reminder about your newsletter",
      preview: "Copy it across and mark it as published.",
      firstName: input.firstName,
      blocks: [
        { type: "p", text: `${newsletterTitle} has not been marked as published. ${LAST_REMINDER}` },
        {
          type: "p",
          text: 'The copy-ready page is still there. When the newsletter is out, select "Mark as published" on that page.',
        },
      ],
      buttonLabel: "Open the newsletter page",
      buttonUrl,
    });
  }

  return render({
    subject: "Your newsletter is due today",
    preview: "The copy is laid out and ready to paste.",
    firstName: input.firstName,
    blocks: [
      { type: "p", text: `${newsletterTitle} is due to be published today.` },
      {
        type: "p",
        text: 'The page has the subject line and text laid out ready to copy. Once it is out, use "Mark as published" on that page so your week stays accurate.',
      },
    ],
    buttonLabel: "Open the newsletter page",
    buttonUrl,
  });
}

/** Renders any reminder by kind. */
export function renderReminderEmail(input: ReminderEmailInput): RenderedReminderEmail {
  switch (input.kind) {
    case "week_ready":
      return renderWeekReady(input);
    case "deploy_week":
      return renderDeployWeek(input);
    case "todays_post":
      return renderTodaysPost(input);
    case "manual_publish":
      return renderManualPublish(input);
  }
}
