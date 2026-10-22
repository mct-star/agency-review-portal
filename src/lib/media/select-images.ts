/**
 * Choosing library photos for a post.
 *
 * Pure and deterministic given a random source, so it can be tested. The
 * rules, in order of weight:
 *   1. only approved photos (never pending, never video unless asked)
 *   2. the weather tag the post asks for, best match first
 *   3. the places and subjects that suit the post type
 *   4. no photo where a person can be seen, when the post asks for that
 *      (automated posts do: a customer's face is not ours to publish
 *      unprompted), and a small penalty where we cannot tell
 *   5. among similarly good photos, the least recently used first, so the
 *      page does not show the same deck every sunny morning
 */

export interface LibraryCandidate {
  id: string;
  kind: "photo" | "video";
  tags: string[];
  people_present: boolean | null;
  last_used_at: string | null;
  used_in_weeks: number[] | null;
  status?: "approved" | "pending";
}

export interface ImageWant {
  /** Weather tags in order of preference, for example ["sunny", "bright"]. */
  weather?: string[];
  place?: string[];
  subject?: string[];
  time?: string[];
  avoidPeople: boolean;
  /** Defaults to photos only. */
  kinds?: Array<"photo" | "video">;
}

const has = (tags: string[], group: string, value: string) => tags.includes(`${group}:${value}`);

function rankScore(tags: string[], group: string, wanted: string[] | undefined, top: number, step: number): number {
  if (!wanted || wanted.length === 0) return 0;
  let best = 0;
  wanted.forEach((value, i) => {
    if (has(tags, group, value)) best = Math.max(best, Math.max(top - i * step, Math.round(top / 4)));
  });
  return best;
}

export function scoreCandidate(c: LibraryCandidate, want: ImageWant): number {
  let score = 0;
  score += rankScore(c.tags, "weather", want.weather, 40, 12);
  score += rankScore(c.tags, "place", want.place, 24, 3);
  score += rankScore(c.tags, "subject", want.subject, 14, 3);
  score += rankScore(c.tags, "time", want.time, 6, 2);
  if (want.avoidPeople && c.people_present === null) score -= 25;
  return score;
}

export interface SelectOptions {
  count: number;
  rng?: () => number;
  excludeIds?: string[];
}

export function selectImages<T extends LibraryCandidate>(candidates: T[], want: ImageWant, opts: SelectOptions): T[] {
  const rng = opts.rng ?? Math.random;
  const kinds = want.kinds ?? ["photo"];
  const exclude = new Set(opts.excludeIds ?? []);

  let pool = candidates.filter(
    (c) =>
      (c.status === undefined || c.status === "approved") &&
      kinds.includes(c.kind) &&
      !exclude.has(c.id) &&
      !(want.avoidPeople && c.people_present === true)
  );
  const hasPreference = !!(want.weather?.length || want.place?.length || want.subject?.length || want.time?.length);
  // With a stated preference, a photo that matches nothing is not a candidate,
  // unless nothing in the library matches anything (then something is better
  // than nothing, and a person approves it anyway).
  if (hasPreference && pool.some((c) => scoreCandidate(c, want) > 0)) {
    pool = pool.filter((c) => scoreCandidate(c, want) > 0);
  }

  const chosen: T[] = [];
  const usedPlaces = new Set<string>();
  while (chosen.length < opts.count && pool.length > 0) {
    const ranked = pool
      .map((c) => {
        const place = c.tags.find((t) => t.startsWith("place:"));
        // After the first pick, favour a different place for variety.
        const variety = place && usedPlaces.has(place) ? -15 : 0;
        return { c, score: scoreCandidate(c, want) + variety, tie: rng() };
      })
      .sort((a, b) => {
        const bucket = Math.round(b.score / 5) - Math.round(a.score / 5);
        if (bucket !== 0) return bucket;
        const la = a.c.last_used_at ? Date.parse(a.c.last_used_at) : -Infinity;
        const lb = b.c.last_used_at ? Date.parse(b.c.last_used_at) : -Infinity;
        if (la !== lb) return la - lb; // never used, then longest ago
        const ua = a.c.used_in_weeks?.length ?? 0;
        const ub = b.c.used_in_weeks?.length ?? 0;
        if (ua !== ub) return ua - ub;
        return a.tie - b.tie;
      });
    const pick = ranked[0]?.c;
    if (!pick) break;
    chosen.push(pick);
    const place = pick.tags.find((t) => t.startsWith("place:"));
    if (place) usedPlaces.add(place);
    pool = pool.filter((c) => c.id !== pick.id);
  }
  return chosen;
}
