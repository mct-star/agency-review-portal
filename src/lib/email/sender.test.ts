import { describe, expect, it } from "vitest";
import { DEFAULT_SENDER, formatFrom, resolveSender } from "./sender";

describe("resolveSender", () => {
  it("falls back to the current sender when the company has no sender set", () => {
    expect(resolveSender(null)).toEqual(DEFAULT_SENDER);
    expect(resolveSender(undefined)).toEqual(DEFAULT_SENDER);
    expect(resolveSender({})).toEqual(DEFAULT_SENDER);
    expect(resolveSender({ from_name: "  ", from_address: "" })).toEqual(DEFAULT_SENDER);
  });

  it("keeps the current sender string exactly, so existing callers behave as before", () => {
    expect(formatFrom(DEFAULT_SENDER)).toBe("AGENCY Bristol <mct@agencybristol.com>");
  });

  it("uses the company's name and address when both are set", () => {
    const sender = resolveSender({ from_name: "Lakeside Brasserie", from_address: "hello@lakeside.example" });
    expect(formatFrom(sender)).toBe("Lakeside Brasserie <hello@lakeside.example>");
  });

  it("uses the company's name with the default address when only the name is set", () => {
    const sender = resolveSender({ from_name: "Lakeside Brasserie" });
    expect(formatFrom(sender)).toBe("Lakeside Brasserie <mct@agencybristol.com>");
  });

  it("ignores an address that is not a plain email address", () => {
    const sender = resolveSender({ from_name: "Lakeside", from_address: "not an address" });
    expect(sender.address).toBe(DEFAULT_SENDER.address);
  });

  it("strips characters that could break the From header out of the name", () => {
    const sender = resolveSender({ from_name: 'Lake<side>"\r\nBcc: x', from_address: "a@b.example" });
    expect(formatFrom(sender)).not.toMatch(/[\r\n"]/);
    expect(formatFrom(sender).endsWith("<a@b.example>")).toBe(true);
  });
});
