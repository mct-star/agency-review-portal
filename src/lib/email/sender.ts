/**
 * Who an email is sent from.
 *
 * The platform has one verified sender today, and every email goes from its
 * address. A company may show its own name ("Name via AGENCY Bristol"), but
 * its own from address is ignored: nothing yet proves the company owns that
 * domain, so using it would let one tenant send as another's domain. When
 * per-company sending domains exist (verified in the email provider), this is
 * where they will be honoured.
 * Pure: no database, no network. The caller loads the company's sender
 * settings and passes them in, and hands the result to sendEmail as `from`.
 */

export interface Sender {
  name: string;
  address: string;
}

/** The sender every email uses today. */
export const DEFAULT_SENDER: Sender = {
  name: "AGENCY Bristol",
  address: "mct@agencybristol.com",
};

/** The per-company sender settings a caller may have loaded. */
export interface CompanySenderSettings {
  from_name?: string | null;
  from_address?: string | null;
}

/** The longest display name we will show, in characters. */
export const MAX_SENDER_NAME_LENGTH = 64;

/**
 * A safe display name, or null to use the default. Line breaks and angle
 * brackets are stripped. A name containing an at sign is refused outright, as
 * it can pass for an address in a mail client. Quotes are left for
 * formatFrom to escape. Capped at MAX_SENDER_NAME_LENGTH.
 */
function cleanName(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.includes("@")) return null;
  const cleaned = value.replace(/[<>\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_SENDER_NAME_LENGTH).trim();
  return cleaned || null;
}

/**
 * The sender for a company: always the default address. A company's own name
 * is shown as "Name via AGENCY Bristol"; its from_address is ignored.
 */
export function resolveSender(settings?: CompanySenderSettings | null): Sender {
  const name = cleanName(settings?.from_name);
  return {
    name: name ? `${name} via ${DEFAULT_SENDER.name}` : DEFAULT_SENDER.name,
    address: DEFAULT_SENDER.address,
  };
}

/**
 * The `from` string the email provider expects: Name <address>.
 *
 * A name made only of letters, digits and spaces is safe as it stands, so the
 * default sender is written exactly as before. Any other character (a comma,
 * a full stop, a quote, a backslash) puts the name in double quotes, with
 * backslash and double quote escaped, so it cannot end the name early or add
 * a second address. Line breaks are never allowed through.
 */
export function formatFrom(sender: Sender): string {
  const name = sender.name.replace(/[\r\n]+/g, " ").trim();
  if (/^[A-Za-z0-9 ]+$/.test(name)) return `${name} <${sender.address}>`;
  return `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" <${sender.address}>`;
}
