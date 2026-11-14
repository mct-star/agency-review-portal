import { describe, expect, it } from "vitest";
import { parseCadenceInput, MAX_REMINDER_RECIPIENTS, CADENCE_MODES, recipientsOutsideCompany, outsideRecipientsMessage } from "./validate";

const ok = { mode: "daily", reminderHour: 8, reminderRecipients: ["A@Example.com"] };

describe("parseCadenceInput", () => {
  it("accepts a valid input and lower-cases and trims emails", () => {
    const r = parseCadenceInput({ ...ok, reminderRecipients: ["  Maria@Example.COM "] });
    expect(r).toEqual({ ok: true, value: { mode: "daily", reminder_hour: 8, reminder_recipients: ["maria@example.com"] } });
  });
  it("accepts every mode and no recipients", () => {
    for (const mode of CADENCE_MODES) {
      expect(parseCadenceInput({ mode, reminderHour: 0, reminderRecipients: [] }).ok).toBe(true);
    }
  });
  it("refuses an unknown mode", () => {
    expect(parseCadenceInput({ ...ok, mode: "hourly" }).ok).toBe(false);
  });
  it.each([-1, 24, 8.5, "8", null, NaN])("refuses hour %s", (h) => {
    const r = parseCadenceInput({ ...ok, reminderHour: h });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/hour/i);
  });
  it.each(["a", "a@b", "a b@c.com", "@c.com", "a@@c.com", "a@c..com", 5])("refuses email %s", (e) => {
    const r = parseCadenceInput({ ...ok, reminderRecipients: [e] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/email/i);
  });
  it("removes duplicates after lower-casing", () => {
    const r = parseCadenceInput({ ...ok, reminderRecipients: ["a@b.com", "A@B.com"] });
    expect(r.ok && r.value.reminder_recipients).toEqual(["a@b.com"]);
  });
  it("caps recipients", () => {
    const many = Array.from({ length: MAX_REMINDER_RECIPIENTS + 1 }, (_, i) => `u${i}@example.com`);
    expect(parseCadenceInput({ ...ok, reminderRecipients: many }).ok).toBe(false);
  });
  it("refuses a non-array recipients value", () => {
    expect(parseCadenceInput({ ...ok, reminderRecipients: "a@b.com" }).ok).toBe(false);
  });
});

describe("recipientsOutsideCompany", () => {
  it("returns the addresses that are not a company user, ignoring case and blanks", () => {
    expect(recipientsOutsideCompany(["a@x.com", "b@y.com"], ["A@X.com ", null, ""])).toEqual(["b@y.com"]);
    expect(recipientsOutsideCompany(["a@x.com"], ["a@x.com"])).toEqual([]);
  });
  it("names every refused address in plain words", () => {
    expect(outsideRecipientsMessage(["b@y.com"])).toBe(
      "b@y.com is not a user in this company. Reminders can only go to people with a login for this company.",
    );
    expect(outsideRecipientsMessage(["b@y.com", "c@z.com"])).toMatch(/^b@y\.com, c@z\.com are not users/);
  });
});
