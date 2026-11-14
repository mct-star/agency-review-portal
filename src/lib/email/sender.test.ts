import { describe, expect, it } from "vitest";
import { DEFAULT_SENDER, MAX_SENDER_NAME_LENGTH, formatFrom, resolveSender } from "./sender";

describe("resolveSender", () => {
  it("falls back to the current sender when the company has no sender set", () => {
    expect(resolveSender(null)).toEqual(DEFAULT_SENDER);
    expect(resolveSender(undefined)).toEqual(DEFAULT_SENDER);
    expect(resolveSender({})).toEqual(DEFAULT_SENDER);
    expect(resolveSender({ from_name: "  ", from_address: "" })).toEqual(DEFAULT_SENDER);
  });

  it("writes the current sender exactly as before: a plain name needs no quotes", () => {
    expect(formatFrom(DEFAULT_SENDER)).toBe("AGENCY Bristol <mct@agencybristol.com>");
  });

  it("shows a company's name as 'Name via AGENCY Bristol' on the default mailbox", () => {
    const sender = resolveSender({ from_name: "Lakeside Brasserie" });
    expect(sender).toEqual({ name: "Lakeside Brasserie via AGENCY Bristol", address: DEFAULT_SENDER.address });
    expect(formatFrom(sender)).toBe("Lakeside Brasserie via AGENCY Bristol <mct@agencybristol.com>");
  });

  it("never uses a company's own from address, valid or not", () => {
    for (const from_address of ["hello@lakeside.example", "ceo@bigbank.example", "not an address", ""]) {
      const sender = resolveSender({ from_name: "Lakeside", from_address });
      expect(sender.address).toBe(DEFAULT_SENDER.address);
      expect(formatFrom(sender)).not.toContain("example");
    }
    expect(resolveSender({ from_address: "hello@lakeside.example" })).toEqual(DEFAULT_SENDER);
  });

  it("keeps a comma in the name safe by quoting it", () => {
    const sender = resolveSender({ from_name: "Smith, Jones and Co" });
    expect(formatFrom(sender)).toBe('"Smith, Jones and Co via AGENCY Bristol" <mct@agencybristol.com>');
  });

  it("escapes a backslash and a double quote inside the quoted name", () => {
    const sender = resolveSender({ from_name: 'The "Best" \\ Bakery' });
    expect(formatFrom(sender)).toBe('"The \\"Best\\" \\\\ Bakery via AGENCY Bristol" <mct@agencybristol.com>');
  });

  it("refuses a name containing an at sign and uses the default name", () => {
    expect(resolveSender({ from_name: "support@bigbank.example" })).toEqual(DEFAULT_SENDER);
    expect(resolveSender({ from_name: "Bank @ Home" })).toEqual(DEFAULT_SENDER);
  });

  it("caps the name at 64 characters before 'via AGENCY Bristol'", () => {
    const sender = resolveSender({ from_name: "A".repeat(200) });
    expect(sender.name).toBe(`${"A".repeat(MAX_SENDER_NAME_LENGTH)} via AGENCY Bristol`);
  });

  it("strips line breaks and angle brackets, so a header injection attempt stays in one header", () => {
    const sender = resolveSender({ from_name: 'Lake<side>"\r\nBcc: victim.example\r\nSubject: hi' });
    const from = formatFrom(sender);
    expect(from).not.toMatch(/[\r\n]/);
    expect(from).not.toMatch(/[<>].*[<>].*[<>]/); // only the one address pair remains
    expect(from.endsWith(" <mct@agencybristol.com>")).toBe(true);
    expect(from.startsWith('"')).toBe(true); // the quote in the name forces quoting
    expect(from.match(/(?<!\\)"/g)).toHaveLength(2); // and the quote inside it is escaped
  });

  it("keeps a break in the name away from the header even when a caller builds the sender by hand", () => {
    const from = formatFrom({ name: 'x"\r\nBcc: a@b.example', address: DEFAULT_SENDER.address });
    expect(from).not.toMatch(/[\r\n]/);
  });
});
