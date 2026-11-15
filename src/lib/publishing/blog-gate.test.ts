import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_BLOG_GATE_SETTINGS, countBlogWords, normaliseImageFile, parseBlogGateSettings, runBlogGate,
  type BlogGateImage, type BlogGateInput, type BlogGateSettings,
} from "./blog-gate";
import { parseImageRecord } from "./blog-image-record";

const DASH = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const TITLE = "Why launches stall";

const hero = (o: Partial<BlogGateImage> = {}): BlogGateImage => ({
  label: "the hero image", role: "hero", file: "/images/blog/example.jpg",
  record: { role: "hero", type: "diagram", passage: "Opening claim" }, ...o,
});
const inline = (o: Partial<BlogGateImage> = {}): BlogGateImage => ({
  label: "inline image 2", role: "inline", file: "/images/blog/example-2.jpg",
  record: { role: "inline", type: "infographic", passage: "Stage list", alt: "A chart of three stages" }, ...o,
});
const share = (o: Partial<BlogGateImage> = {}): BlogGateImage => ({
  label: "the share image", role: "share", file: "/images/blog/example-og.jpg",
  record: { role: "share", passage: "Share card" }, width: 1200, height: 630, ...o,
});
const input = (o: Partial<BlogGateInput> = {}): BlogGateInput => ({
  pieceTitle: TITLE, body: "A short body.", images: [hero(), inline(), share()],
  settings: { ...DEFAULT_BLOG_GATE_SETTINGS }, ...o,
});
const check = (i: BlogGateInput, code: string) => runBlogGate(i).checks.find(c => c.code === code)!;
const settings = (o: Partial<BlogGateSettings>): BlogGateSettings => ({ ...DEFAULT_BLOG_GATE_SETTINGS, ...o });

describe("runBlogGate", () => {
  it("passes a complete blog and lists every check", () => {
    const r = runBlogGate(input());
    expect(r.problems).toEqual([]);
    expect(r.checks.map(c => c.code)).toEqual(["records", "type", "passage", "treatment", "alt", "inline_present", "share", "dashes"]);
    expect(r.checks.every(c => c.passed)).toBe(true);
  });

  it("a: flags an image with no record", () => {
    const c = check(input({ images: [hero(), inline({ record: null }), share()] }), "records");
    expect(c.passed).toBe(false);
    expect(c.problems[0]).toContain("inline image 2 has no image record");
  });

  it("b: flags a missing or unknown type, and the share image needs none", () => {
    const bad = check(input({ images: [hero({ record: { role: "hero", type: "cartoon" as never, passage: "p" } }), share()] }), "type");
    expect(bad.passed).toBe(false);
    expect(bad.problems[0]).toContain('"cartoon"');
    const none = check(input({ images: [hero({ record: { role: "hero", passage: "p" } }), share()] }), "type");
    expect(none.problems[0]).toContain("no type");
    expect(check(input(), "type").passed).toBe(true);
  });

  it("c: flags a record with no passage line, share image included", () => {
    const c = check(input({ images: [hero(), share({ record: { role: "share", passage: "  " } })] }), "passage");
    expect(c.passed).toBe(false);
    expect(c.problems[0]).toContain("the share image has no passage line");
    expect(check(input(), "passage").passed).toBe(true);
  });

  it("d: needs the treatment on a photograph only when one is set", () => {
    const photo = inline({ record: { role: "inline", type: "photograph", passage: "p", alt: "a" } });
    const set = input({ images: [hero(), photo, share()], settings: settings({ photographTreatment: "watermark-a" }) });
    const fail = check(set, "treatment");
    expect(fail.passed).toBe(false);
    expect(fail.problems[0]).toContain("inline image 2");
    const ok = inline({ record: { role: "inline", type: "photograph", passage: "p", alt: "a", treatment: "watermark-a" } });
    expect(check({ ...set, images: [hero(), ok, share()] }, "treatment").passed).toBe(true);
    const unset = check({ ...set, settings: settings({ photographTreatment: null }) }, "treatment");
    expect(unset.passed).toBe(true);
    expect(unset.required).toBe(false);
    expect(unset.label).not.toContain("not required");
    expect(check(set, "treatment").required).toBe(true);
  });

  it("e: flags an inline image with empty alt text", () => {
    const c = check(input({ images: [hero(), inline({ record: { role: "inline", type: "diagram", passage: "p", alt: "  " } }), share()] }), "alt");
    expect(c.passed).toBe(false);
    expect(c.problems[0]).toBe(`Blog "${TITLE}": inline image 2 has no alt text. Describe what it shows in one line.`);
    expect(check(input({ images: [hero(), share()] }), "alt").passed).toBe(true);
  });

  it("f: a long blog needs an inline image, unless the limit is null", () => {
    const body = "word ".repeat(950);
    const noInline = input({ body, images: [hero(), share()] });
    const c = check(noInline, "inline_present");
    expect(c.passed).toBe(false);
    expect(c.problems[0]).toContain("950 words");
    expect(check({ ...noInline, images: [hero(), inline(), share()] }, "inline_present").passed).toBe(true);
    const off = check({ ...noInline, settings: settings({ inlineImageWordLimit: null }) }, "inline_present");
    expect(off.passed).toBe(true);
    expect(off.required).toBe(false);
    expect(check(noInline, "inline_present").label).toBe("A blog over 900 words has at least one inline image");
    expect(off.label).not.toContain("not required");
    expect(check({ ...noInline, body: "word ".repeat(900) }, "inline_present").passed).toBe(true);
  });

  it("g: needs a share image of 1200 by 630 that is not the hero", () => {
    expect(check(input({ images: [hero(), inline()] }), "share").problems[0]).toContain("no share image");
    expect(check(input({ images: [hero(), share({ height: null })] }), "share").problems.join(" ")).toContain("could not be measured");
    expect(check(input({ images: [hero(), share({ width: 800, height: 600 })] }), "share").problems[0]).toContain("800 by 600");
    expect(check(input({ images: [hero(), share({ record: { role: "inline", passage: "p" } })] }), "share").problems[0]).toContain('"inline" role');
    expect(check(input({ images: [hero(), share({ file: "/other/EXAMPLE.jpg?v=2" })] }), "share").problems[0]).toContain("same file as the hero");
    expect(check(input({ images: [hero({ sha256: "abc" }), share({ sha256: "abc" })] }), "share").problems[0]).toContain("same file as the hero");
    expect(check(input({ images: [hero({ sha256: "ABC" }), share({ sha256: "abc" })] }), "share").problems[0]).toContain("same file as the hero");
    expect(check(input({ images: [hero({ sha256: "abc" }), share({ sha256: "def" })] }), "share").passed).toBe(true);
    for (const bad of [NaN, Infinity]) {
      expect(check(input({ images: [hero(), share({ width: bad })] }), "share").problems[0]).toContain("could not be measured");
    }
    expect(check(input(), "share").passed).toBe(true);
  });

  it("g: a share image is not required when the setting is off", () => {
    const c = check(input({ images: [hero(), inline()], settings: settings({ requireShareCard: false }) }), "share");
    expect(c.passed).toBe(true);
    expect(c.required).toBe(false);
    expect(c.label).not.toContain("not required");
    expect(check(input({ images: [hero(), inline()] }), "share").required).toBe(true);
    const present = check(input({ settings: settings({ requireShareCard: false }) }), "share");
    expect(present.required).toBe(true);
  });

  it("h: flags long dashes in the title, body and alt text", () => {
    expect(check(input({ pieceTitle: `Launches ${DASH} stalled` }), "dashes").problems[0]).toContain("title");
    expect(check(input({ body: `One ${EN} two` }), "dashes").problems[0]).toContain("body");
    const alt = inline({ record: { role: "inline", type: "diagram", passage: "p", alt: `A ${DASH} B` } });
    expect(check(input({ images: [hero(), alt, share()] }), "dashes").problems[0]).toContain("inline image 2");
    expect(check(input(), "dashes").passed).toBe(true);
  });

  it("every image problem names the piece and the image, with no long dash", () => {
    const r = runBlogGate({
      pieceTitle: TITLE, body: "word ".repeat(950), settings: settings({ photographTreatment: "watermark-a" }),
      images: [
        hero({ record: null }),
        inline({ record: { role: "inline", type: "photograph", passage: "", alt: "" } }),
        share({ width: 100, height: 100, record: { role: "hero", passage: "" } }),
      ],
    });
    expect(r.problems.length).toBeGreaterThan(5);
    for (const p of r.problems) {
      expect(p).toContain(`Blog "${TITLE}"`);
      expect(/the hero image|inline image 2|the share image|no inline image/.test(p)).toBe(true);
      expect(p.includes(DASH) || p.includes(EN)).toBe(false);
    }
  });

  it("a record with no role is accepted for a hero or inline image, not reported as missing", () => {
    const noRole = { passage: "p", type: "diagram" as const, alt: "An alt" };
    const r = runBlogGate(input({ images: [hero({ record: noRole }), inline({ record: noRole }), share()] }));
    expect(r.problems).toEqual([]);
  });

  it("an explicit role that contradicts where the image is used gets its own sentence", () => {
    const c = check(input({ images: [hero({ record: { role: "inline", type: "diagram", passage: "p" } }), share()] }), "records");
    expect(c.passed).toBe(false);
    expect(c.problems[0]).toBe(`Blog "${TITLE}": the hero image has a record marked "inline", but it is used as the hero image. Change the record to match.`);
    const odd = check(input({ images: [inline({ record: { role: "banner", type: "diagram", passage: "p", alt: "a" } }), share()] }), "records");
    expect(odd.problems[0]).toContain('marked "banner"');
    expect(odd.problems[0]).not.toContain("has no image record");
  });

  it("a share record with no role asks for it to be marked as the share image", () => {
    const c = check(input({ images: [hero(), share({ record: { passage: "p" } })] }), "share");
    expect(c.problems[0]).toContain("not marked as the share image");
  });

  it("flattens problems in check order", () => {
    const r = runBlogGate(input({ images: [hero({ record: null }), share({ width: 1 })] }));
    expect(r.problems).toEqual(r.checks.flatMap(c => c.problems));
    expect(r.checks[0].problems.length).toBe(1);
  });
});

describe("word counting", () => {
  const OLD = (b: string) => (b.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[\[\s*image:[^\]]*\]\]/gi, " ").match(/\S+/g) || []).length;
  const samples = [
    "plain words here", "one ![alt](/a.jpg) two", "a [[image: 2]] b\n[[ IMAGE: hero ]]\nc", "![broken](/a.jpg and ![ok](/b.png) tail",
    "![a](b) ![c](d)", "text [[image: 1] not closed", "![", "[[image:", "x ![y]\n(z) w", "",
  ];
  it("counts normal bodies as before", () => {
    for (const b of samples) expect(countBlogWords(b), JSON.stringify(b)).toBe(OLD(b));
  });
  it("finishes quickly on unclosed openings", () => {
    for (const unit of ["![", "[[image:", "![](", "![a]("]) {
      const body = unit.repeat(Math.ceil(200000 / unit.length));
      const t = Date.now();
      countBlogWords(body);
      expect(Date.now() - t).toBeLessThan(1000);
    }
  });
});

describe("helpers", () => {
  it("normalises files like the local script", () => {
    expect(normaliseImageFile(' "/images/blog/A-OG.JPG?v=3" ')).toBe("a-og.jpg");
  });
  it("counts words without markdown images or image slots", () => {
    expect(countBlogWords("one two ![alt text](/x.jpg) [[image: 1]]\nthree")).toBe(3);
  });
  it("parses settings field by field", () => {
    expect(parseBlogGateSettings(null)).toEqual(DEFAULT_BLOG_GATE_SETTINGS);
    expect(parseBlogGateSettings({ photographTreatment: "watermark-a", inlineImageWordLimit: null, requireShareCard: false }))
      .toEqual({ photographTreatment: "watermark-a", inlineImageWordLimit: null, requireShareCard: false });
    expect(parseBlogGateSettings({ inlineImageWordLimit: "x", requireShareCard: "no", photographTreatment: 4 }))
      .toEqual(DEFAULT_BLOG_GATE_SETTINGS);
  });
});

// Parity with validate_blog_images.py: a test-only adapter from blog.mdx plus record.json.
const FIXTURES = join(__dirname, "__fixtures__", "blog-gate");
const norm = normaliseImageFile;

function adapt(blog: string, recordJson: { images?: unknown[] }): BlogGateInput {
  const fm = /^---\s*\n([\s\S]*?)\n---\s*\n?/.exec(blog);
  const front = fm ? fm[1] : "";
  const body = fm ? blog.slice(fm[0].length) : blog;
  const entries = (recordJson.images || []) as Array<Record<string, unknown>>;
  const recordFor = (file: string) => {
    const e = entries.find(x => norm(String(x.file || "")) === norm(file));
    return e ? parseImageRecord(e) : null;
  };
  const images: BlogGateImage[] = [];
  const h = /^heroImage:\s*(\S+)/m.exec(front);
  if (h) images.push({ label: "the hero image", role: "hero", file: h[1], record: recordFor(h[1]) });
  let n = 0;
  for (const m of body.matchAll(/!\[([^\]]*)\]\(\s*([^)\s]+)[^)]*\)/g)) {
    n += 1;
    const record = recordFor(m[2]);
    images.push({ label: `inline image ${n}`, role: "inline", file: m[2], record: record ? { ...record, alt: m[1].trim() } : null });
  }
  const o = /^ogImage:[ \t]*(\S+)/m.exec(front);
  if (o) images.push({ label: "the share image", role: "share", file: o[1], record: recordFor(o[1]), width: 1200, height: 630 });
  return {
    pieceTitle: TITLE, body, images,
    settings: { ...DEFAULT_BLOG_GATE_SETTINGS, photographTreatment: "watermark-a" },
  };
}

describe("parity fixtures", () => {
  const cases = readdirSync(FIXTURES, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  it("has the required cases", () => {
    for (const c of ["all-good", "no-record", "bad-type", "photograph-no-treatment", "empty-alt", "long-no-inline",
      "no-og", "og-same-as-hero", "og-role-not-share", "no-passage"]) expect(cases).toContain(c);
  });
  for (const name of cases) {
    it(`agrees with expected.json: ${name}`, () => {
      const read = (f: string) => readFileSync(join(FIXTURES, name, f), "utf8");
      const report = runBlogGate(adapt(read("blog.mdx"), JSON.parse(read("record.json"))));
      const expected = JSON.parse(read("expected.json")) as { pass: boolean; codes: string[] };
      expect(report.problems.length === 0).toBe(expected.pass);
      expect(report.checks.filter(c => !c.passed).map(c => c.code)).toEqual(expected.codes);
    });
  }
});
