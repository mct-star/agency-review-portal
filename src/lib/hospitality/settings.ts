/**
 * Validation for the hospitality settings a company can change itself.
 * Only the fields named here are ever written, so a request cannot touch the
 * plan, the trial or anything else on the company row.
 */

export const NETWORKS = ["facebook", "instagram", "linkedin", "threads", "bluesky", "x", "tiktok", "gbp"] as const;

export interface SettingsPatch {
  post_pack?: "b2b" | "hospitality";
  social_networks?: string[];
  hospitality_settings?: {
    venue_notes?: string;
    standing_hashtags?: string[];
    allow_emoji?: boolean;
  };
  postcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string;
  weather_post_enabled?: boolean;
  weather_post_time?: string;
  weather_post_for?: "today" | "tomorrow";
}

export type SettingsResult = { ok: true; patch: SettingsPatch } | { ok: false; error: string };

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** UK postcode shape (outward and inward parts), upper-cased with one space. */
export function normalisePostcode(raw: string): string | null {
  const t = raw.toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(t)) return null;
  return `${t.slice(0, -3)} ${t.slice(-3)}`;
}

export function validateSettings(body: Record<string, unknown>): SettingsResult {
  const patch: SettingsPatch = {};

  if (body.post_pack !== undefined) {
    if (body.post_pack !== "b2b" && body.post_pack !== "hospitality") return { ok: false, error: "post_pack must be b2b or hospitality" };
    patch.post_pack = body.post_pack;
  }

  if (body.social_networks !== undefined) {
    if (!Array.isArray(body.social_networks) || !body.social_networks.every((n) => (NETWORKS as readonly string[]).includes(n as string))) {
      return { ok: false, error: `social_networks must be a list of: ${NETWORKS.join(", ")}` };
    }
    patch.social_networks = [...new Set(body.social_networks as string[])];
  }

  if (body.hospitality_settings !== undefined) {
    const h = body.hospitality_settings as Record<string, unknown>;
    if (!h || typeof h !== "object") return { ok: false, error: "hospitality_settings must be an object" };
    const out: NonNullable<SettingsPatch["hospitality_settings"]> = {};
    if (h.venue_notes !== undefined) {
      if (typeof h.venue_notes !== "string") return { ok: false, error: "venue_notes must be text" };
      out.venue_notes = h.venue_notes.trim().slice(0, 1000);
    }
    if (h.standing_hashtags !== undefined) {
      if (!Array.isArray(h.standing_hashtags)) return { ok: false, error: "standing_hashtags must be a list" };
      out.standing_hashtags = h.standing_hashtags
        .filter((t): t is string => typeof t === "string")
        .map((t) => `#${t.replace(/[^A-Za-z0-9]/g, "")}`)
        .filter((t) => t.length > 1)
        .slice(0, 8);
    }
    if (h.allow_emoji !== undefined) {
      if (typeof h.allow_emoji !== "boolean") return { ok: false, error: "allow_emoji must be true or false" };
      out.allow_emoji = h.allow_emoji;
    }
    patch.hospitality_settings = out;
  }

  if (body.postcode !== undefined) {
    if (body.postcode === null || body.postcode === "") patch.postcode = null;
    else if (typeof body.postcode === "string" && normalisePostcode(body.postcode)) patch.postcode = normalisePostcode(body.postcode);
    else return { ok: false, error: "That does not look like a UK postcode" };
  }
  for (const key of ["latitude", "longitude"] as const) {
    if (body[key] === undefined) continue;
    const v = body[key];
    if (v === null || v === "") {
      patch[key] = null;
      continue;
    }
    const n = typeof v === "number" ? v : Number(v);
    const limit = key === "latitude" ? 90 : 180;
    if (!Number.isFinite(n) || Math.abs(n) > limit) return { ok: false, error: `${key} is not a valid position` };
    patch[key] = n;
  }

  if (body.timezone !== undefined) {
    if (typeof body.timezone !== "string" || !isValidTimeZone(body.timezone)) return { ok: false, error: "That time zone is not recognised" };
    patch.timezone = body.timezone;
  }
  if (body.weather_post_enabled !== undefined) {
    if (typeof body.weather_post_enabled !== "boolean") return { ok: false, error: "weather_post_enabled must be true or false" };
    patch.weather_post_enabled = body.weather_post_enabled;
  }
  if (body.weather_post_time !== undefined) {
    if (typeof body.weather_post_time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(body.weather_post_time)) {
      return { ok: false, error: "The post time must be like 07:00" };
    }
    patch.weather_post_time = body.weather_post_time.slice(0, 5);
  }
  if (body.weather_post_for !== undefined) {
    if (body.weather_post_for !== "today" && body.weather_post_for !== "tomorrow") return { ok: false, error: "weather_post_for must be today or tomorrow" };
    patch.weather_post_for = body.weather_post_for;
  }

  if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to change" };
  return { ok: true, patch };
}
