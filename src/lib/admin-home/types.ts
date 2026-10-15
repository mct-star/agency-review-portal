/**
 * The admin home: four panels, each three numbers and up to five rows you can
 * act on in place. The shape agency-ops uses for its Command Centre.
 *
 * A verb is only offered when a route exists that does exactly what the
 * label says. Anything else is a link to where the work lives.
 */

export interface Stat {
  label: string;
  value: number | string;
  /** Optional tone for the number: "warn" draws the eye. */
  tone?: "plain" | "warn" | "good";
}

export interface Verb {
  label: string;
  /** Route to call. */
  method: "POST" | "PATCH";
  path: string;
  body: Record<string, unknown>;
  /** Asks before running, for anything that cannot be undone in a tap. */
  confirm?: string;
  tone?: "primary" | "danger" | "plain";
}

export interface ActionRow {
  id: string;
  title: string;
  sub: string;
  /** Where the row's detail lives. */
  href: string;
  ageLabel?: string;
  verbs: Verb[];
}

export interface Panel {
  key: "waiting" | "clients" | "jobs" | "tickets";
  title: string;
  numbers: Stat[];
  rows: ActionRow[];
  seeAll: { label: string; href: string };
  /** When a loader could not read its source. The panel says so instead of showing zeros. */
  error?: string;
}

export function ageLabel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
