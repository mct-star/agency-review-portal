import { describe, expect, it } from "vitest";
import { applyMentions, validateMentionUrn, type MentionEntry } from "./mentions";
import { escapeLittleText } from "./post-text";

const list: MentionEntry[] = [
  { name: "Jane Smith", urn: "urn:li:person:abc123", kind: "person" },
  { name: "Jane", urn: "urn:li:person:short1", kind: "person" },
  { name: "Contura", urn: "urn:li:organization:12345", kind: "organization" },
];

describe("applyMentions", () => {
  it("turns a listed ＠name into LinkedIn mention markup, person and organisation", () => {
    const r = applyMentions("Thanks ＠Jane Smith and ＠Contura for the day.", list);
    expect(r.commentary).toBe("Thanks @\\[Jane Smith\\](urn:li:person:abc123) and @\\[Contura\\](urn:li:organization:12345) for the day.".replace(/@\\\[/g, "@[").replace(/\\\]\(/g, "]("));
    expect(r.converted).toEqual(["Jane Smith", "Contura"]);
    expect(r.unknown).toEqual([]);
  });

  it("prefers the longest listed name and keeps following words as plain text", () => {
    const r = applyMentions("Cheers ＠Jane Smith, and ＠Jane Is great", list);
    expect(r.commentary).toContain("@[Jane Smith](urn:li:person:abc123)");
    expect(r.commentary).toContain("@[Jane](urn:li:person:short1) Is great");
  });

  it("leaves a name with no URN as plain text and reports it", () => {
    const r = applyMentions("Thanks ＠Nobody Known today", list);
    expect(r.commentary).toBe("Thanks ＠Nobody Known today");
    expect(r.unknown).toEqual(["Nobody Known"]);
    expect(r.converted).toEqual([]);
  });

  it("matches a plain @ as well as the full-width one, ignoring case", () => {
    expect(applyMentions("Hi @Jane Smith", list).commentary).toBe("Hi @[Jane Smith](urn:li:person:abc123)");
    expect(applyMentions("Hi ＠jane smith", [{ ...list[0], name: "JANE SMITH" }]).converted).toEqual(["JANE SMITH"]);
  });

  it("changes nothing for a post with no mentions: it equals the escaped text", () => {
    const text = "Plain post (with brackets) and [more] #tag_x";
    expect(applyMentions(text, list).commentary).toBe(escapeLittleText(text).trim());
  });

  it("escapes reserved characters around a mention so the post reads as written", () => {
    expect(applyMentions("(Thanks ＠Contura)", list).commentary).toBe("\\(Thanks @[Contura](urn:li:organization:12345)\\)");
  });
});

describe("validateMentionUrn", () => {
  it("accepts a URN of the right kind and refuses a wrong one", () => {
    expect(validateMentionUrn("person", "urn:li:person:AbC-1_2")).toBeNull();
    expect(validateMentionUrn("organization", "urn:li:organization:12345")).toBeNull();
    expect(validateMentionUrn("person", "urn:li:organization:12345")).toMatch(/person URN/);
    expect(validateMentionUrn("organization", "urn:li:organization:abc")).toMatch(/organisation URN/);
    expect(validateMentionUrn("person", "https://linkedin.com/in/x")).not.toBeNull();
  });
});
