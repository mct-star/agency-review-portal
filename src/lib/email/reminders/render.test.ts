import { describe, expect, it } from "vitest";
import {
  REMINDER_EMAIL_KINDS,
  capWords,
  renderDeployWeek,
  renderManualPublish,
  renderReminderEmail,
  renderTodaysPost,
  renderWeekReady,
  tidyLabel,
} from "./render";
import type { ReminderKind } from "@/types/database";

const URL_ = "https://app.example.com/page";
// Built from the code point so this file never contains the character itself.
const EM_DASH = new RegExp(String.fromCharCode(0x2014));
const EN_DASH = String.fromCharCode(0x2013);

const week = {
  firstName: "Sam",
  weekLabel: "10 to 16 November",
  countsByType: "5 LinkedIn posts and 2 videos",
  recordingsNeeded: "Two videos need a recording from you.",
  reviewUrl: "https://app.example.com/weeks/abc",
};

describe("kinds line up with the due function", () => {
  it("covers every reminder kind except capture_due, using the same names", () => {
    const all: ReminderKind[] = ["week_ready", "deploy_week", "todays_post", "manual_publish", "capture_due"];
    expect([...REMINDER_EMAIL_KINDS].sort()).toEqual(all.filter((k) => k !== "capture_due").sort());
  });
});

describe("week_ready", () => {
  it("first send matches the approved copy", () => {
    const e = renderWeekReady({ ...week, isFollowUp: false });
    expect(e.subject).toBe("Your content for 10 to 16 November is ready");
    expect(e.preview).toBe("Review, adjust and approve in one sitting.");
    expect(e.buttonLabel).toBe("Review the week");
    expect(e.text).toBe(
      [
        "Hi Sam,",
        "",
        "Your content for 10 to 16 November is made and ready to review.",
        "",
        "5 LinkedIn posts and 2 videos",
        "",
        "Two videos need a recording from you.",
        "",
        "Read each piece, change what you want and approve it when you are happy. It should take one sitting.",
        "",
        "Review the week",
        "https://app.example.com/weeks/abc",
      ].join("\n"),
    );
    expect(e.html).toContain('href="https://app.example.com/weeks/abc"');
    expect(e.html).toContain("Review the week");
    expect(e.html).toContain("Review, adjust and approve in one sitting.");
  });

  it("follow-up matches the approved copy and leaves out the recordings line", () => {
    const e = renderWeekReady({ ...week, isFollowUp: true });
    expect(e.subject).toBe("Reminder about 10 to 16 November");
    expect(e.preview).toBe("Nothing goes out without your approval.");
    expect(e.buttonLabel).toBe("Review the week");
    expect(e.text).toBe(
      [
        "Hi Sam,",
        "",
        "Your content for 10 to 16 November is still waiting for review. This is the last reminder we will send.",
        "",
        "5 LinkedIn posts and 2 videos",
        "",
        "Nothing is published without your approval, so the timing is yours.",
        "",
        "Review the week",
        "https://app.example.com/weeks/abc",
      ].join("\n"),
    );
    expect(e.text).not.toContain("recording");
  });

  it("renders no recordings line, and no blank gap, when it is empty", () => {
    for (const blank of [null, undefined, "", "   "]) {
      const e = renderWeekReady({ ...week, recordingsNeeded: blank, isFollowUp: false });
      expect(e.text).toBe(
        [
          "Hi Sam,",
          "",
          "Your content for 10 to 16 November is made and ready to review.",
          "",
          "5 LinkedIn posts and 2 videos",
          "",
          "Read each piece, change what you want and approve it when you are happy. It should take one sitting.",
          "",
          "Review the week",
          "https://app.example.com/weeks/abc",
        ].join("\n"),
      );
      expect(e.html).not.toMatch(/<p[^>]*>\s*<\/p>/);
    }
  });
});

describe("deploy_week", () => {
  const input = { firstName: "Sam", weekLabel: "10 to 16 November", deployUrl: "https://app.example.com/deploy" };

  it("first send matches the approved copy", () => {
    const e = renderDeployWeek({ ...input, isFollowUp: false });
    expect(e.subject).toBe("10 to 16 November is approved and ready to deploy");
    expect(e.preview).toBe("Everything is approved. Deploy when you are ready.");
    expect(e.buttonLabel).toBe("Open the deploy page");
    expect(e.text).toBe(
      [
        "Hi Sam,",
        "",
        "Everything for 10 to 16 November is approved. The button opens the deploy page, where you can deploy the week.",
        "",
        "Three steps stay manual:",
        "- Publishing the blog post",
        "- Uploading the scheduling file",
        "- Publishing the newsletter",
        "",
        "Open the deploy page",
        "https://app.example.com/deploy",
      ].join("\n"),
    );
    expect(e.html.match(/<li/g)).toHaveLength(3);
  });

  it("follow-up matches the approved copy", () => {
    const e = renderDeployWeek({ ...input, isFollowUp: true });
    expect(e.subject).toBe("Reminder to deploy 10 to 16 November");
    expect(e.preview).toBe("Your approved content is ready when you are.");
    expect(e.text).toBe(
      [
        "Hi Sam,",
        "",
        "Your approved content for 10 to 16 November has not been deployed yet. This is the last reminder we will send.",
        "",
        "Once you deploy, the manual steps remain: publishing the blog post, uploading the scheduling file and publishing the newsletter.",
        "",
        "Open the deploy page",
        "https://app.example.com/deploy",
      ].join("\n"),
    );
  });
});

describe("todays_post", () => {
  const input = {
    firstName: "Sam",
    postDate: "Friday 14 November",
    postTitle: "Why buyers wait",
    postPreview: "A short preview of the post.",
    postUrl: "https://app.example.com/posts/1",
  };

  it("first send matches the approved copy", () => {
    const e = renderTodaysPost({ ...input, isFollowUp: false });
    expect(e.subject).toBe("Today's post is waiting for you");
    expect(e.preview).toBe("Why buyers wait");
    expect(e.buttonLabel).toBe("Review today's post");
    expect(e.text).toBe(
      [
        "Hi Sam,",
        "",
        "Your post for Friday 14 November is ready.",
        "",
        "A short preview of the post.",
        "",
        "The link opens the post, where you can edit it and approve it.",
        "",
        "Review today's post",
        "https://app.example.com/posts/1",
      ].join("\n"),
    );
  });

  it("follow-up matches the approved copy", () => {
    const e = renderTodaysPost({ ...input, isFollowUp: true });
    expect(e.subject).toBe("Reminder about your post for Friday 14 November");
    expect(e.preview).toBe("Why buyers wait");
    expect(e.text).toBe(
      [
        "Hi Sam,",
        "",
        "Your post for Friday 14 November is still waiting. This is the last reminder we will send.",
        "",
        "A short preview of the post.",
        "",
        "It will not go out without your approval.",
        "",
        "Review today's post",
        "https://app.example.com/posts/1",
      ].join("\n"),
    );
  });

  it("caps the preview at 40 words", () => {
    const long = Array.from({ length: 60 }, (_, i) => `w${i + 1}`).join(" ");
    const e = renderTodaysPost({ ...input, postPreview: long, isFollowUp: false });
    expect(e.text).toContain("w40…");
    expect(e.text).not.toContain("w41");
  });

  it("renders the post title with no hyphens, dashes or colons", () => {
    const e = renderTodaysPost({ ...input, postTitle: `Pricing: the long-term view ${EN_DASH} part 2`, isFollowUp: false });
    expect(e.preview).not.toMatch(/[-:‐-―]/);
    expect(e.preview).toBe("Pricing the long term view part 2");
  });
});

describe("manual_publish", () => {
  const input = { firstName: "Sam", newsletterTitle: "The November note", publishUrl: "https://app.example.com/newsletter/1" };

  it("first send matches the approved copy", () => {
    const e = renderManualPublish({ ...input, isFollowUp: false });
    expect(e.subject).toBe("Your newsletter is due today");
    expect(e.preview).toBe("The copy is laid out and ready to paste.");
    expect(e.buttonLabel).toBe("Open the newsletter page");
    expect(e.text).toBe(
      [
        "Hi Sam,",
        "",
        "The November note is due to be published today.",
        "",
        'The page has the subject line and text laid out ready to copy. Once it is out, use "Mark as published" on that page so your week stays accurate.',
        "",
        "Open the newsletter page",
        "https://app.example.com/newsletter/1",
      ].join("\n"),
    );
  });

  it("follow-up matches the approved copy", () => {
    const e = renderManualPublish({ ...input, isFollowUp: true });
    expect(e.subject).toBe("Reminder about your newsletter");
    expect(e.preview).toBe("Copy it across and mark it as published.");
    expect(e.text).toBe(
      [
        "Hi Sam,",
        "",
        "The November note has not been marked as published. This is the last reminder we will send.",
        "",
        'The copy-ready page is still there. When the newsletter is out, select "Mark as published" on that page.',
        "",
        "Open the newsletter page",
        "https://app.example.com/newsletter/1",
      ].join("\n"),
    );
  });
});

describe("template rules", () => {
  it("falls back to Hello, when the first name is blank", () => {
    for (const blank of [null, undefined, "", "  "]) {
      const e = renderManualPublish({ firstName: blank, newsletterTitle: "N", publishUrl: URL_, isFollowUp: false });
      expect(e.text.startsWith("Hello,\n")).toBe(true);
      expect(e.text).not.toContain("Hi ");
      expect(e.html).toContain("Hello,");
      expect(e.html).not.toContain("Hi ,");
    }
  });

  it("caps a post preview at 40 words and leaves a 40 word preview alone", () => {
    expect(capWords("one two three", 40)).toBe("one two three");
    const forty = Array.from({ length: 40 }, (_, i) => `w${i + 1}`).join(" ");
    expect(capWords(forty, 40)).toBe(forty);
    const capped = capWords(`${forty} extra`, 40);
    expect(capped.split(/\s+/)).toHaveLength(40);
    expect(capped.endsWith("w40…")).toBe(true);
  });

  it("collapses whitespace in a preview before counting", () => {
    expect(capWords("  a \n b\t c  ", 40)).toBe("a b c");
  });

  it("renders a week label with no hyphens, dashes or colons", () => {
    expect(tidyLabel("10-16 November")).toBe("10 to 16 November");
    expect(tidyLabel(`10${EN_DASH}16 November`)).toBe("10 to 16 November");
    expect(tidyLabel(`10 ${EN_DASH} 16 November`)).toBe("10 to 16 November");
    expect(tidyLabel("Week 46: 10-16 November")).toBe("Week 46 10 to 16 November");
    const e = renderWeekReady({ ...week, weekLabel: "10-16 November", isFollowUp: false });
    expect(e.subject).toBe("Your content for 10 to 16 November is ready");
    expect(e.text).toContain("Your content for 10 to 16 November is made");
  });

  it("escapes every variable in the HTML", () => {
    const evil = '<script>alert("x")</script>&';
    const e = renderWeekReady({
      firstName: evil,
      weekLabel: evil,
      countsByType: evil,
      recordingsNeeded: evil,
      reviewUrl: 'https://app.example.com/a?x=1&y="2"',
      isFollowUp: false,
    });
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.html).toContain("&amp;y=&quot;2&quot;");
    const p = renderTodaysPost({
      firstName: evil,
      postDate: evil,
      postTitle: evil,
      postPreview: evil,
      postUrl: URL_,
      isFollowUp: false,
    });
    expect(p.html).not.toContain("<script>");
    const m = renderManualPublish({ firstName: evil, newsletterTitle: evil, publishUrl: URL_, isFollowUp: true });
    expect(m.html).not.toContain("<script>");
    const d = renderDeployWeek({ firstName: evil, weekLabel: evil, deployUrl: URL_, isFollowUp: true });
    expect(d.html).not.toContain("<script>");
  });

  it("only accepts plain http or https links for the button", () => {
    expect(() => renderManualPublish({ firstName: "S", newsletterTitle: "N", publishUrl: "javascript:alert(1)", isFollowUp: false })).toThrow();
    expect(() => renderManualPublish({ firstName: "S", newsletterTitle: "N", publishUrl: "", isFollowUp: false })).toThrow();
  });

  it("uses no em dashes or emojis in any rendered email", () => {
    const all = [
      renderWeekReady({ ...week, isFollowUp: false }),
      renderWeekReady({ ...week, isFollowUp: true }),
      renderDeployWeek({ firstName: "S", weekLabel: "W", deployUrl: URL_, isFollowUp: false }),
      renderDeployWeek({ firstName: "S", weekLabel: "W", deployUrl: URL_, isFollowUp: true }),
      renderTodaysPost({ firstName: "S", postDate: "D", postTitle: "T", postPreview: "P", postUrl: URL_, isFollowUp: false }),
      renderTodaysPost({ firstName: "S", postDate: "D", postTitle: "T", postPreview: "P", postUrl: URL_, isFollowUp: true }),
      renderManualPublish({ firstName: "S", newsletterTitle: "N", publishUrl: URL_, isFollowUp: false }),
      renderManualPublish({ firstName: "S", newsletterTitle: "N", publishUrl: URL_, isFollowUp: true }),
    ];
    for (const e of all) {
      expect(`${e.subject}${e.preview}${e.text}${e.html}`).not.toMatch(EM_DASH);
      expect(`${e.subject}${e.preview}${e.text}`).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe("renderReminderEmail", () => {
  it("dispatches on kind for all four kinds", () => {
    expect(renderReminderEmail({ kind: "week_ready", ...week, isFollowUp: false }).subject).toContain("is ready");
    expect(renderReminderEmail({ kind: "deploy_week", firstName: "S", weekLabel: "W", deployUrl: URL_, isFollowUp: false }).subject).toContain("ready to deploy");
    expect(
      renderReminderEmail({ kind: "todays_post", firstName: "S", postDate: "D", postTitle: "T", postPreview: "P", postUrl: URL_, isFollowUp: false }).subject,
    ).toBe("Today's post is waiting for you");
    expect(renderReminderEmail({ kind: "manual_publish", firstName: "S", newsletterTitle: "N", publishUrl: URL_, isFollowUp: false }).subject).toBe(
      "Your newsletter is due today",
    );
  });

  it("does not approve, deploy or mark anything: the button is a plain link", () => {
    const e = renderReminderEmail({ kind: "deploy_week", firstName: "S", weekLabel: "W", deployUrl: "https://app.example.com/deploy", isFollowUp: false });
    expect(e.html).not.toMatch(/<form|<button|method="post"/i);
    expect(e.html.match(/href="/g)).toHaveLength(1);
  });
});
