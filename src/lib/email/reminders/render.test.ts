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
  BUTTON_COLOUR,
  type DeployManualStep,
} from "./render";
import type { ReminderKind } from "@/types/database";

const URL_ = "https://app.example.com/page";
// Built from the code point so this file never contains the character itself.
const EM_DASH = new RegExp(String.fromCharCode(0x2014));
const EN_DASH = String.fromCharCode(0x2013);

const ALL_STEPS: DeployManualStep[] = ["blog", "scheduler", "newsletter"];

/** WCAG relative luminance contrast ratio of white text on a hex background. */
function whiteContrast(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  return 1.05 / (luminance + 0.05);
}

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
    const e = renderWeekReady({ ...week, firstPostDate: "10 November", isFollowUp: true });
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
        "Your first post is due on 10 November. Nothing is published without your approval, so anything not approved will wait.",
        "",
        "Review the week",
        "https://app.example.com/weeks/abc",
      ].join("\n"),
    );
    expect(e.text).not.toContain("recording");
    expect(e.text).not.toContain("the timing is yours");
    expect(e.html).toContain("Your first post is due on 10 November. Nothing is published without your approval, so anything not approved will wait.");
  });

  it("follow-up keeps only the second sentence when the first post date is unknown", () => {
    for (const unknown of [undefined, null, "", "   "]) {
      const e = renderWeekReady({ ...week, firstPostDate: unknown, isFollowUp: true });
      expect(e.text).toContain("\n\nNothing is published without your approval, so anything not approved will wait.\n\n");
      expect(e.text).not.toContain("Your first post is due");
      expect(e.html).not.toContain("Your first post is due");
    }
  });

  it("follow-up renders the first post date with no hyphens, dashes or colons", () => {
    const e = renderWeekReady({ ...week, firstPostDate: `10${EN_DASH}11 November`, isFollowUp: true });
    expect(e.text).toContain("Your first post is due on 10 to 11 November. ");
  });

  it("the first send never names a first post date", () => {
    const e = renderWeekReady({ ...week, firstPostDate: "10 November", isFollowUp: false });
    expect(e.text).not.toContain("Your first post is due");
  });

  it("drops a blank counts line with no empty paragraph or double gap", () => {
    for (const blank of ["", "   ", "\n\t"]) {
      for (const isFollowUp of [false, true]) {
        const e = renderWeekReady({ ...week, countsByType: blank, firstPostDate: "10 November", isFollowUp });
        expect(e.text).not.toContain("\n\n\n");
        expect(e.html).not.toMatch(/<p[^>]*>\s*<\/p>/);
        expect(e.text).not.toContain("5 LinkedIn");
      }
    }
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
  const input = { firstName: "Sam", weekLabel: "10 to 16 November", manualSteps: ALL_STEPS, deployUrl: "https://app.example.com/deploy" };

  it("first send matches the approved copy with all three steps", () => {
    const e = renderDeployWeek({ ...input, isFollowUp: false });
    expect(e.subject).toBe("Your content for 10 to 16 November is approved and ready to deploy");
    expect(e.preview).toBe("Everything is approved. Deploy when you are ready.");
    expect(e.buttonLabel).toBe("Open the deploy page");
    expect(e.text).toBe(
      [
        "Hi Sam,",
        "",
        "Everything for 10 to 16 November is approved. The button opens the deploy page, where you can deploy the week.",
        "",
        "These steps stay manual:",
        "- Publishing the blog post",
        "- Uploading the scheduling file",
        "- Publishing the newsletter",
        "",
        "Open the deploy page",
        "https://app.example.com/deploy",
      ].join("\n"),
    );
    expect(e.html.match(/<li/g)).toHaveLength(3);
    expect(e.text).not.toContain("Three steps");
  });

  it("first send lists one step only", () => {
    const e = renderDeployWeek({ ...input, manualSteps: ["scheduler"], isFollowUp: false });
    expect(e.text).toContain("These steps stay manual:\n- Uploading the scheduling file\n\nOpen the deploy page");
    expect(e.text).not.toContain("blog");
    expect(e.text).not.toContain("newsletter");
    expect(e.html.match(/<li/g)).toHaveLength(1);
  });

  it("first send lists two steps in the fixed order, once each, whatever order they arrive in", () => {
    const e = renderDeployWeek({ ...input, manualSteps: ["newsletter", "blog", "newsletter"], isFollowUp: false });
    expect(e.text).toContain("These steps stay manual:\n- Publishing the blog post\n- Publishing the newsletter\n\n");
    expect(e.html.match(/<li/g)).toHaveLength(2);
  });

  it("first send leaves out the lead and the list when there are no steps", () => {
    const e = renderDeployWeek({ ...input, manualSteps: [], isFollowUp: false });
    expect(e.text).toBe(
      [
        "Hi Sam,",
        "",
        "Everything for 10 to 16 November is approved. The button opens the deploy page, where you can deploy the week.",
        "",
        "Open the deploy page",
        "https://app.example.com/deploy",
      ].join("\n"),
    );
    expect(e.text).not.toContain("stay manual");
    expect(e.html).not.toContain("<ul");
    expect(e.html).not.toContain("stay manual");
  });

  it("follow-up matches the approved copy with all three steps", () => {
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

  it("follow-up names one step, two steps, and leaves the sentence out for none", () => {
    const one = renderDeployWeek({ ...input, manualSteps: ["newsletter"], isFollowUp: true });
    expect(one.text).toContain("Once you deploy, the manual steps remain: publishing the newsletter.");
    const two = renderDeployWeek({ ...input, manualSteps: ["blog", "scheduler"], isFollowUp: true });
    expect(two.text).toContain("Once you deploy, the manual steps remain: publishing the blog post and uploading the scheduling file.");
    const none = renderDeployWeek({ ...input, manualSteps: [], isFollowUp: true });
    expect(none.text).toBe(
      [
        "Hi Sam,",
        "",
        "Your approved content for 10 to 16 November has not been deployed yet. This is the last reminder we will send.",
        "",
        "Open the deploy page",
        "https://app.example.com/deploy",
      ].join("\n"),
    );
    expect(none.text).not.toContain("manual steps");
    expect(none.html).not.toMatch(/<p[^>]*>\s*<\/p>/);
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
        "The button opens the post, where you can edit and approve it.",
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

  it("drops a blank preview with no empty paragraph or double gap", () => {
    for (const blank of ["", "   ", "\n\t"]) {
      for (const isFollowUp of [false, true]) {
        const e = renderTodaysPost({ ...input, postPreview: blank, isFollowUp });
        expect(e.text).not.toContain("\n\n\n");
        expect(e.html).not.toMatch(/<p[^>]*>\s*<\/p>/);
        expect(e.text).not.toContain("A short preview");
      }
    }
  });

  it("throws on a blank post title, so no empty preview line is sent", () => {
    for (const blank of ["", "   ", "\n", "-", ": -"]) {
      expect(() => renderTodaysPost({ ...input, postTitle: blank, isFollowUp: false })).toThrow(/post title/);
      expect(() => renderTodaysPost({ ...input, postTitle: blank, isFollowUp: true })).toThrow(/post title/);
    }
  });

  it("trims and collapses the post date before it goes in a subject, and throws when blank", () => {
    const e = renderTodaysPost({ ...input, postDate: "  Friday \n  14   November ", isFollowUp: true });
    expect(e.subject).toBe("Reminder about your post for Friday 14 November");
    expect(e.text).toContain("Your post for Friday 14 November is still waiting.");
    const first = renderTodaysPost({ ...input, postDate: "  Friday  14 November  ", isFollowUp: false });
    expect(first.text).toContain("Your post for Friday 14 November is ready.");
    for (const blank of ["", "   ", "\t\n"]) {
      expect(() => renderTodaysPost({ ...input, postDate: blank, isFollowUp: true })).toThrow(/post date/);
      expect(() => renderTodaysPost({ ...input, postDate: blank, isFollowUp: false })).toThrow(/post date/);
    }
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

  it("throws on a blank newsletter title, so no sentence starts with a space", () => {
    for (const blank of ["", "   ", "\n\t"]) {
      expect(() => renderManualPublish({ ...input, newsletterTitle: blank, isFollowUp: false })).toThrow(/newsletter title/);
      expect(() => renderManualPublish({ ...input, newsletterTitle: blank, isFollowUp: true })).toThrow(/newsletter title/);
    }
  });

  it("trims and collapses the newsletter title", () => {
    const e = renderManualPublish({ ...input, newsletterTitle: "  The  November \n note ", isFollowUp: false });
    expect(e.text).toContain("\n\nThe November note is due to be published today.\n\n");
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
    const d = renderDeployWeek({ firstName: evil, weekLabel: evil, manualSteps: ALL_STEPS, deployUrl: URL_, isFollowUp: true });
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
      renderDeployWeek({ firstName: "S", weekLabel: "W", manualSteps: ALL_STEPS, deployUrl: URL_, isFollowUp: false }),
      renderDeployWeek({ firstName: "S", weekLabel: "W", manualSteps: ALL_STEPS, deployUrl: URL_, isFollowUp: true }),
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

describe("HTML presentation", () => {
  const all = () => [
    renderWeekReady({ ...week, firstPostDate: "10 November", isFollowUp: false }),
    renderWeekReady({ ...week, firstPostDate: "10 November", isFollowUp: true }),
    renderDeployWeek({ firstName: "S", weekLabel: "W", manualSteps: ALL_STEPS, deployUrl: URL_, isFollowUp: false }),
    renderDeployWeek({ firstName: "S", weekLabel: "W", manualSteps: [], deployUrl: URL_, isFollowUp: true }),
    renderTodaysPost({ firstName: "S", postDate: "D", postTitle: "T", postPreview: "P", postUrl: URL_, isFollowUp: false }),
    renderManualPublish({ firstName: "S", newsletterTitle: "N", publishUrl: URL_, isFollowUp: true }),
  ];

  it("has no AGENCY Content Platform header wording or gradient band", () => {
    for (const e of all()) {
      expect(e.html).not.toContain("AGENCY Content Platform");
      expect(e.html).not.toContain("AGENCY");
      expect(e.html).not.toContain("<h1");
      expect(e.html).not.toContain("gradient");
      expect(e.text).not.toContain("AGENCY Content Platform");
    }
  });

  it("keeps the approved step wording in the deploy HTML", () => {
    const first = renderDeployWeek({ firstName: "S", weekLabel: "W", manualSteps: ALL_STEPS, deployUrl: URL_, isFollowUp: false });
    expect(first.html).toContain("These steps stay manual:");
    const followUp = renderDeployWeek({ firstName: "S", weekLabel: "W", manualSteps: ALL_STEPS, deployUrl: URL_, isFollowUp: true });
    expect(followUp.html).toContain("Once you deploy, the manual steps remain:");
  });

  it("has no colon or hyphen in any subject across all eight variants", () => {
    const subjects = [false, true].flatMap((isFollowUp) => [
      renderWeekReady({ ...week, isFollowUp }).subject,
      renderDeployWeek({ firstName: "S", weekLabel: "10-16 November", manualSteps: ALL_STEPS, deployUrl: URL_, isFollowUp }).subject,
      renderTodaysPost({ firstName: "S", postDate: "Friday 14 November", postTitle: "T", postPreview: "P", postUrl: URL_, isFollowUp }).subject,
      renderManualPublish({ firstName: "S", newsletterTitle: "N", publishUrl: URL_, isFollowUp }).subject,
    ]);
    expect(subjects).toHaveLength(8);
    for (const subject of subjects) expect(subject).not.toMatch(/[-:]/);
  });

  it("gives the button white text with a contrast ratio of at least 4.5 to 1", () => {
    expect(whiteContrast(BUTTON_COLOUR)).toBeGreaterThanOrEqual(4.5);
    expect(whiteContrast("#0ea5e9")).toBeLessThan(4.5);
    for (const e of all()) {
      expect(e.html).toContain(`background-color:${BUTTON_COLOUR}`);
      expect(e.html).not.toContain("#0ea5e9");
    }
  });
});

describe("renderReminderEmail", () => {
  it("dispatches on kind for all four kinds", () => {
    expect(renderReminderEmail({ kind: "week_ready", ...week, isFollowUp: false }).subject).toContain("is ready");
    expect(renderReminderEmail({ kind: "deploy_week", firstName: "S", weekLabel: "W", manualSteps: ALL_STEPS, deployUrl: URL_, isFollowUp: false }).subject).toContain("ready to deploy");
    expect(
      renderReminderEmail({ kind: "todays_post", firstName: "S", postDate: "D", postTitle: "T", postPreview: "P", postUrl: URL_, isFollowUp: false }).subject,
    ).toBe("Today's post is waiting for you");
    expect(renderReminderEmail({ kind: "manual_publish", firstName: "S", newsletterTitle: "N", publishUrl: URL_, isFollowUp: false }).subject).toBe(
      "Your newsletter is due today",
    );
  });

  it("does not approve, deploy or mark anything: the button is a plain link", () => {
    const e = renderReminderEmail({ kind: "deploy_week", firstName: "S", weekLabel: "W", manualSteps: ALL_STEPS, deployUrl: "https://app.example.com/deploy", isFollowUp: false });
    expect(e.html).not.toMatch(/<form|<button|method="post"/i);
    expect(e.html.match(/href="/g)).toHaveLength(1);
  });
});
