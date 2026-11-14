/**
 * Who an email is sent from.
 *
 * The platform has one verified sender today. A company can carry its own
 * name and address once its domain is verified in the email provider; until
 * then, and for any company that has not set one, the current sender is used.
 * Pure: no database, no network. The caller loads the company's sender
 * settings and passes them in, and hands the result to sendEmail as `from`.
 *
 * Where a company's sender settings are stored is not decided here (it needs
 * a schema change). Callers with nothing to pass get the current sender.
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

const PLAIN_ADDRESS = /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]+$/;

function cleanName(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[<>"\r\n]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function cleanAddress(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && PLAIN_ADDRESS.test(trimmed) ? trimmed : null;
}

/**
 * The sender for a company: its own name and address where set and valid,
 * the current sender for anything missing.
 */
export function resolveSender(settings?: CompanySenderSettings | null): Sender {
  return {
    name: cleanName(settings?.from_name) ?? DEFAULT_SENDER.name,
    address: cleanAddress(settings?.from_address) ?? DEFAULT_SENDER.address,
  };
}

/** The `from` string the email provider expects: Name <address>. */
export function formatFrom(sender: Sender): string {
  return `${sender.name} <${sender.address}>`;
}
