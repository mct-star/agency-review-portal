#!/usr/bin/env node
/**
 * Seed calendar_slots from the MCT quarterly calendar markdown.
 *
 * Prerequisite: migration 032 must be applied first.
 *
 * The two calendars are the source contract for weekly planning:
 * every slot names a source owner and a specific anchor, not a
 * topic area. This script turns them into rows so a week card can
 * read its own pillar, theme, source owner and photo requirement
 * instead of a planner improvising from a Downloads scan.
 *
 * Usage:
 *   node scripts/seed-calendar-slots.mjs                    # dry run, both files
 *   node scripts/seed-calendar-slots.mjs --file q3          # dry run, Q3 bridge only
 *   node scripts/seed-calendar-slots.mjs --file /path/x.md  # dry run, explicit path
 *   node scripts/seed-calendar-slots.mjs --apply            # write to Supabase
 *   node scripts/seed-calendar-slots.mjs --strict-anchors   # reactive slots need anchors too
 *   node scripts/seed-calendar-slots.mjs --company slug     # default agency-bristol
 *   node scripts/seed-calendar-slots.mjs --year 2027        # override the coverage year
 *
 * Behaviour that matters:
 *   - Dry run is the default. Nothing is written without --apply.
 *   - Any row that cannot be parsed is reported by file, week and
 *     line, and --apply refuses to run. A partial silent seed is
 *     the exact failure this whole exercise is correcting.
 *   - Nothing is invented. A row with no source owner fails. A row
 *     with no anchor fails unless it is a REACTIVE slot, which the
 *     calendar defines as held open for a live signal and so
 *     cannot carry an anchor at build time. Run --strict-anchors
 *     to remove that exemption and see the difference.
 *   - Idempotent on (company_id, week_number, year, day_of_week,
 *     slot_type). Re-running updates calendar-derived fields only
 *     and never touches status, notes or post_type_slug.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const HOME = process.env.HOME || "";

const CALENDAR_DIR = [
  HOME,
  "Library/CloudStorage/GoogleDrive-mct@agencybristol.com",
  "Shared drives/Agency Internal",
  "AGENCY INTERNAL | Commercial",
  "AGENCY INTERNAL | Commercial | AGENCY Marketing",
  "AGENCY | Content Workflow Templates",
].join("/");

const KNOWN_FILES = {
  q3: `${CALENDAR_DIR}/MCT_Q3_Bridge_W36-39_v1.md`,
  q4: `${CALENDAR_DIR}/MCT_Q4_Calendar_v1.md`,
};

// ---- CLI ---------------------------------------------------

const args = process.argv.slice(2);
const opts = {
  apply: args.includes("--apply"),
  strictAnchors: args.includes("--strict-anchors"),
  verbose: args.includes("--verbose"),
  companySlug: "agency-bristol",
  files: [],
  year: null,
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--company" && args[i + 1]) opts.companySlug = args[++i];
  else if (args[i] === "--year" && args[i + 1]) opts.year = Number(args[++i]);
  else if (args[i] === "--file" && args[i + 1]) {
    const v = args[++i];
    opts.files.push(KNOWN_FILES[v] || resolve(process.cwd(), v));
  }
}
if (opts.files.length === 0) opts.files = [KNOWN_FILES.q3, KNOWN_FILES.q4];

// ---- Env ---------------------------------------------------

function loadEnv() {
  const envPath = resolve(projectRoot, ".env.local");
  const vars = {};
  if (!existsSync(envPath)) return vars;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    // .env.local in this repo wraps values in double quotes, which
    // createClient rejects as an invalid URL. Strip a matching pair.
    const value = trimmed.slice(eq + 1).replace(/^(['"])(.*)\1$/, "$2");
    vars[trimmed.slice(0, eq)] = value;
  }
  return vars;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const haveCreds = Boolean(supabaseUrl && serviceKey);

// ---- Vocabulary --------------------------------------------

const OWNERS = [
  { label: "Booksy", key: "booksy" },
  { label: "Stratty canon", key: "stratty_canon" },
  { label: "Industry Radar", key: "industry_radar" },
  { label: "Voice note", key: "voice_note" },
  { label: "PPCy", key: "ppcy" },
  { label: "Amy", key: "amy" },
];

const CLASSES = { THESIS: "thesis", DOC: "doc", CAROUSEL: "carousel", REACTIVE: "reactive" };

const DAYS = {
  Mon: { name: "monday", offset: 0 },
  Tue: { name: "tuesday", offset: 1 },
  Wed: { name: "wednesday", offset: 2 },
  Thu: { name: "thursday", offset: 3 },
  Fri: { name: "friday", offset: 4 },
  Sat: { name: "saturday", offset: 5 },
  Sun: { name: "sunday", offset: 6 },
};

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const EXPECTED_HEADER = [
  "Day", "Slot", "Class", "Topic", "Pillar / Theme",
  "Source owner and anchor", "Image", "ELU",
];

// ---- Date helpers (all UTC, so BST never shifts a slot) -----

function utc(y, m, d) {
  return new Date(Date.UTC(y, m, d));
}

function addDays(date, n) {
  return new Date(date.getTime() + n * 86400000);
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function isoWeek(date) {
  const t = utc(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = utc(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return { week, year: t.getUTCFullYear() };
}

function monthIndex(name) {
  if (!name) return -1;
  const n = name.toLowerCase();
  const exact = MONTHS.indexOf(n);
  if (exact !== -1) return exact;
  return MONTHS.findIndex((m) => m.startsWith(n.slice(0, 3)));
}

// ---- Text helpers ------------------------------------------

function stripBold(s) {
  return s.replace(/\*\*/g, "").trim();
}

function splitCells(line) {
  return line.split("|").slice(1, -1).map((c) => c.trim());
}

function isSeparatorRow(line) {
  return /^\|[\s:|-]+\|?\s*$/.test(line);
}

function matchOwnerAtStart(s) {
  for (const o of OWNERS) {
    const re = new RegExp(`^\\*\\*${o.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\*\\*`, "i");
    const m = s.match(re);
    if (m) return { key: o.key, length: m[0].length };
  }
  return null;
}

function allOwnersIn(s) {
  const found = [];
  for (const o of OWNERS) {
    const re = new RegExp(`\\*\\*${o.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\*\\*`, "i");
    const m = s.match(re);
    if (m) found.push({ key: o.key, at: m.index });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.key);
}

/**
 * Peel connective-plus-owner sequences off the front of the
 * remainder, so an alternation such as "or **Industry Radar**"
 * is recognised as a second owner rather than mistaken for an
 * anchor. What survives is the anchor, or nothing.
 */
function stripAlternations(rest) {
  let s = rest.trim();
  for (;;) {
    const m = s.match(/^(?:,|\bor\b|\band\b|\bplus\b|\s)+/);
    if (!m || !m[0]) break;
    const after = s.slice(m[0].length);
    const owner = matchOwnerAtStart(after);
    if (!owner) break;
    s = after.slice(owner.length).trim();
  }
  return s.trim();
}

// ---- Parser ------------------------------------------------

function parseCalendar(path, overrideYear) {
  const raw = readFileSync(path, "utf-8");
  const lines = raw.split("\n");
  const file = basename(path);

  const failures = [];
  const rows = [];
  const weeks = [];

  const fail = (lineNo, week, detail, text) => {
    failures.push({ file, lineNo, week: week || "(no week)", detail, text: (text || "").slice(0, 160) });
  };

  // Coverage year comes from the file's own "Covers ..." line, so
  // a calendar for a different year seeds correctly without a flag.
  let baseYear = overrideYear;
  if (!baseYear) {
    const coversLine = lines.slice(0, 20).find((l) => /^\*?Covers\b/i.test(l.trim().replace(/^\*/, "")));
    const m = coversLine && coversLine.match(/\b(20\d{2})\b/);
    if (!m) {
      fail(0, null, "No coverage year found. Expected a line starting 'Covers' with a four digit year. Pass --year to override.", coversLine || "");
      return { file, path, rows, weeks, failures };
    }
    baseYear = Number(m[1]);
  }

  let week = null;
  let inWeekTable = false;
  let lastStartMonth = -1;
  let year = baseYear;

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i];

    const wk = line.match(/^###\s+Week\s+(\d+)\s*\(([^)]+)\)\s*(?:\|\s*(.*?))?\s*$/);
    if (wk) {
      inWeekTable = false;
      const label = `W${wk[1]}`;
      const range = wk[2].trim();
      const title = (wk[3] || "").trim() || null;

      const rm = range.match(/^(\d{1,2})(?:\s+([A-Za-z]+))?\s+to\s+(\d{1,2})\s+([A-Za-z]+)$/);
      if (!rm) {
        fail(lineNo, label, "Week heading date range not understood. Expected '7 to 13 September' or '28 September to 4 October'.", range);
        week = null;
        continue;
      }

      const endMonth = monthIndex(rm[4]);
      const startMonth = rm[2] ? monthIndex(rm[2]) : endMonth;
      if (startMonth < 0 || endMonth < 0) {
        fail(lineNo, label, "Month name in week heading not recognised.", range);
        week = null;
        continue;
      }

      if (lastStartMonth !== -1 && startMonth < lastStartMonth) year += 1;
      lastStartMonth = startMonth;

      const startDate = utc(year, startMonth, Number(rm[1]));
      const endYear = endMonth < startMonth ? year + 1 : year;
      const endDate = utc(endYear, endMonth, Number(rm[3]));

      if (startDate.getUTCDay() !== 1) {
        fail(lineNo, label, `Week does not start on a Monday. Resolved ${ymd(startDate)} which is a ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][startDate.getUTCDay()]}. The coverage year is probably wrong.`, range);
        week = null;
        continue;
      }

      const iso = isoWeek(startDate);
      week = {
        label,
        fileNumber: Number(wk[1]),
        title,
        range,
        startDate,
        endDate,
        isoWeek: iso.week,
        isoYear: iso.year,
        theme: null,
        tierNote: null,
      };
      weeks.push(week);
      continue;
    }

    if (week && /^\*\*Theme:\*\*/.test(line)) {
      week.theme = line.replace(/^\*\*Theme:\*\*/, "").replace(/\*\*/g, "").trim();
      continue;
    }
    if (week && /^\*\*Tier/.test(line)) {
      week.tierNote = stripBold(line);
      continue;
    }

    if (!line.startsWith("|")) continue;
    if (isSeparatorRow(line)) continue;

    const cells = splitCells(line);

    // Header. Section 5 of the bridge calendar carries three tier
    // template tables with a different four column shape. They are
    // not week rows and must not be seeded, so a non-matching
    // header closes the table rather than opening one.
    if (/^day$/i.test(cells[0] || "")) {
      inWeekTable = Boolean(week) &&
        cells.length === EXPECTED_HEADER.length &&
        cells.every((c, j) => c.toLowerCase() === EXPECTED_HEADER[j].toLowerCase());
      continue;
    }

    if (!inWeekTable) continue;
    if (!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(cells[0] || "")) continue;

    const parsed = parseRow(cells, { week, file, lineNo, line, strictAnchors: opts.strictAnchors });
    if (parsed.error) fail(lineNo, week.label, parsed.error, line);
    else rows.push(parsed.row);
  }

  return { file, path, rows, weeks, failures, baseYear };
}

function parseRow(cells, ctx) {
  const { week, file, lineNo, strictAnchors } = ctx;

  // The source column carries an unescaped pipe when it is written
  // in the documented "Owner | Anchor" form, so a row is nine cells
  // when owner and anchor are separated and eight when the source
  // is one blob. Any other width is a genuine malformation.
  let day, slotRole, klass, topic, pillarTheme, ownerCell, anchorCell, imageCell, eluCell;
  if (cells.length === 9) {
    [day, slotRole, klass, topic, pillarTheme, ownerCell, anchorCell, imageCell, eluCell] = cells;
  } else if (cells.length === 8) {
    [day, slotRole, klass, topic, pillarTheme, ownerCell, imageCell, eluCell] = cells;
    anchorCell = null;
  } else {
    return { error: `Unexpected cell count ${cells.length}. Expected 8 or 9.` };
  }

  // Day and date, cross-checked against the week heading.
  const dm = day.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})(?:\s+([A-Za-z]{3,}))?$/);
  if (!dm) return { error: `Day cell not understood: "${day}". Expected "Mon 7" or "Thu 1 Oct".` };
  const dayDef = DAYS[dm[1]];
  const slotDate = addDays(week.startDate, dayDef.offset);
  if (slotDate.getUTCDate() !== Number(dm[2])) {
    return { error: `Day of month mismatch. Row says ${dm[1]} ${dm[2]}, week ${week.label} starting ${ymd(week.startDate)} puts that day on ${ymd(slotDate)}.` };
  }
  if (dm[3]) {
    const declared = monthIndex(dm[3]);
    if (declared !== slotDate.getUTCMonth()) {
      return { error: `Month mismatch. Row says ${dm[1]} ${dm[2]} ${dm[3]}, resolved date is ${ymd(slotDate)}.` };
    }
  }

  const slotType = CLASSES[stripBold(klass).toUpperCase()];
  if (!slotType) return { error: `Class not recognised: "${klass}". Expected THESIS, DOC, CAROUSEL or REACTIVE.` };

  if (!topic || !topic.trim()) return { error: "Topic cell is empty." };

  // Pillar / Theme (S-tags)
  const ptm = pillarTheme.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  const left = (ptm ? ptm[1] : pillarTheme).trim();
  const tagGroup = ptm ? ptm[2] : "";
  const tags = (tagGroup.match(/S[1-6]/g) || []);
  if (!left) return { error: `Pillar missing from "Pillar / Theme" cell: "${pillarTheme}".` };
  if (tags.length === 0) return { error: `No six-source tag (S1 to S6) in "Pillar / Theme" cell: "${pillarTheme}".` };
  const slash = left.split(" / ");
  const pillar = stripBold(slash[0]);
  const theme = slash.length > 1 ? stripBold(slash.slice(1).join(" / ")) : null;

  // Source owner and anchor. Nothing here is inferred: the owner
  // must be a named owner from the calendar's own vocabulary, and
  // the anchor is whatever the calendar actually wrote.
  const ownerMatch = matchOwnerAtStart(ownerCell.trim());
  if (!ownerMatch) {
    return { error: `No named source owner at the start of the source cell: "${ownerCell}". A slot without a named owner is a prompt, not a plan.` };
  }
  const sourceOwner = ownerMatch.key;
  const remainder = ownerCell.trim().slice(ownerMatch.length);

  let anchor;
  if (cells.length === 9) {
    const prefix = stripAlternations(remainder);
    const tail = (anchorCell || "").trim();
    anchor = [prefix, tail].filter(Boolean).join(" ").trim();
  } else {
    anchor = stripAlternations(remainder);
  }
  anchor = stripBold(anchor) || null;

  const alternates = allOwnersIn(ownerCell + " " + (anchorCell || "")).filter((k) => k !== sourceOwner);

  let anchorPending = false;
  if (!anchor) {
    // A reactive slot is defined by the calendar as held open for a
    // live signal, so it cannot name an anchor at build time. Every
    // other class must.
    if (slotType === "reactive" && !strictAnchors) anchorPending = true;
    else {
      return { error: `No source anchor. Owner is ${sourceOwner} but the row names no chapter, section, figure or pattern to open.${slotType === "reactive" ? " (Reactive slot, running with --strict-anchors.)" : ""}` };
    }
  }

  // ELU
  const em = stripBold(eluCell).match(/^E([0-3])\s+L([0-3])\s+U([0-3])$/);
  if (!em) return { error: `ELU cell not understood: "${eluCell}". Expected "E3 L3 U3".` };

  const imageDirection = stripBold(imageCell) || null;
  const photoNeeded = /new photo/i.test(imageCell);

  // The only CTA statement that lives on a row is the explicit
  // "No commercial resolve" on the free Friday post. Everything
  // else is stated per movement in prose, and deriving it per row
  // would attach CTAs to slots that carry none.
  const ctaTier = /no commercial resolve/i.test(topic) ? "none" : null;

  return {
    row: {
      week_number: week.isoWeek,
      year: week.isoYear,
      week_start_date: ymd(week.startDate),
      source_week_label: week.label,
      slot_date: ymd(slotDate),
      day_of_week: dayDef.name,
      slot_type: slotType,
      slot_role: stripBold(slotRole) || null,
      post_type_slug: null,
      topic: stripBold(topic),
      pillar,
      theme,
      six_source_tags: tags,
      source_owner: sourceOwner,
      source_alternates: alternates.length ? alternates : null,
      source_anchor: anchor,
      anchor_pending: anchorPending,
      image_direction: imageDirection,
      photo_needed: photoNeeded,
      elu: stripBold(eluCell),
      elu_e: Number(em[1]),
      elu_l: Number(em[2]),
      elu_u: Number(em[3]),
      cta_tier: ctaTier,
      status: "planned",
      seeded_from: file,
      _lineNo: lineNo,
      _weekLabel: week.label,
    },
  };
}

// ---- Reporting ---------------------------------------------

function pad(s, n) {
  const v = String(s ?? "");
  return v.length > n ? v.slice(0, n - 1) + "…" : v.padEnd(n);
}

function printParse(result) {
  console.log(`\n${"=".repeat(118)}`);
  console.log(`FILE  ${result.file}`);
  console.log(`PATH  ${result.path}`);
  console.log(`${"=".repeat(118)}`);

  if (result.weeks.length === 0) {
    console.log("  No week tables found.");
    return;
  }

  console.log(
    `\n  ${pad("LABEL", 6)}${pad("ISO", 10)}${pad("W/C", 12)}${pad("SLOTS", 7)}THEME`,
  );
  console.log(`  ${"-".repeat(114)}`);
  for (const w of result.weeks) {
    const n = result.rows.filter((r) => r._weekLabel === w.label).length;
    const flag = w.isoWeek !== w.fileNumber ? ` (file says ${w.fileNumber})` : "";
    console.log(
      `  ${pad(w.label, 6)}${pad(`${w.isoWeek}/${w.isoYear}`, 10)}${pad(ymd(w.startDate), 12)}${pad(n, 7)}${(w.theme || w.title || "").slice(0, 60)}${flag}`,
    );
  }

  console.log(
    `\n  ${pad("WEEK", 6)}${pad("DAY", 11)}${pad("DATE", 12)}${pad("TYPE", 10)}${pad("PILLAR/THEME", 17)}${pad("OWNER", 16)}${pad("PH", 4)}${pad("ELU", 10)}ANCHOR`,
  );
  console.log(`  ${"-".repeat(114)}`);
  for (const r of result.rows) {
    console.log(
      `  ${pad(r.source_week_label, 6)}${pad(r.day_of_week, 11)}${pad(r.slot_date, 12)}${pad(r.slot_type, 10)}` +
        `${pad(r.theme ? `${r.pillar}/${r.theme}` : r.pillar, 17)}${pad(r.source_owner, 16)}` +
        `${pad(r.photo_needed ? "yes" : "no", 4)}${pad(r.elu, 10)}` +
        `${r.anchor_pending ? "[pending, reactive]" : (r.source_anchor || "").slice(0, 42)}`,
    );
  }

  const offset = result.weeks.filter((w) => w.isoWeek !== w.fileNumber);
  if (offset.length) {
    console.log(
      `\n  NOTE  ${offset.length} of ${result.weeks.length} weeks are numbered one lower in the markdown than their real ISO week.`,
    );
    console.log(
      "        week_number is stored as the ISO week derived from the actual Monday, so it joins correctly to weeks.week_number.",
    );
    console.log(
      "        source_week_label keeps the calendar's own label. Nothing is renumbered silently.",
    );
  }

  const pending = result.rows.filter((r) => r.anchor_pending);
  if (pending.length) {
    console.log(`\n  ANCHOR PENDING (${pending.length}) - reactive slots held open for a live signal, anchor set at planning time:`);
    for (const r of pending) {
      console.log(`        ${r.source_week_label} ${pad(r.day_of_week, 10)} ${r.slot_date}  owner=${r.source_owner}  "${r.topic.slice(0, 58)}"`);
    }
    console.log("        Run with --strict-anchors to treat these as parse failures instead.");
  }

  console.log(`\n  PARSED ${result.rows.length} rows across ${result.weeks.length} weeks. Failures: ${result.failures.length}.`);
}

function printFailures(all) {
  if (all.length === 0) return;
  console.log(`\n${"!".repeat(118)}`);
  console.log(`PARSE FAILURES: ${all.length}. Nothing will be written.`);
  console.log(`${"!".repeat(118)}`);
  for (const f of all) {
    console.log(`\n  ${f.file}:${f.lineNo}  [${f.week}]`);
    console.log(`    ${f.detail}`);
    if (f.text) console.log(`    > ${f.text}`);
  }
}

// ---- Persistence -------------------------------------------

// Calendar-derived fields only. status, notes and post_type_slug
// are owned by the platform once a slot exists and a re-seed must
// never reset a briefed or shipped slot back to planned.
const DERIVED_FIELDS = [
  "week_start_date", "source_week_label", "slot_date", "slot_role",
  "topic", "pillar", "theme", "six_source_tags", "source_owner",
  "source_alternates", "source_anchor", "anchor_pending",
  "image_direction", "photo_needed", "elu", "elu_e", "elu_l", "elu_u",
  "cta_tier", "seeded_from",
];

function keyOf(r) {
  return [r.week_number, r.year, r.day_of_week, r.slot_type].join("|");
}

function differs(existing, row) {
  return DERIVED_FIELDS.some((f) => JSON.stringify(existing[f] ?? null) !== JSON.stringify(row[f] ?? null));
}

async function persist(supabase, companyId, rows) {
  const { data: existingRows, error: selErr } = await supabase
    .from("calendar_slots")
    .select("id, week_number, year, day_of_week, slot_type, " + DERIVED_FIELDS.join(", "))
    .eq("company_id", companyId);
  if (selErr) throw new Error(`Could not read existing calendar_slots: ${selErr.message}`);

  const existing = new Map((existingRows || []).map((r) => [keyOf(r), r]));

  const weekKeys = [...new Set(rows.map((r) => `${r.week_number}|${r.year}`))];
  const { data: weekRows, error: weekErr } = await supabase
    .from("weeks")
    .select("id, week_number, year")
    .eq("company_id", companyId)
    .in("week_number", [...new Set(rows.map((r) => r.week_number))]);
  if (weekErr) throw new Error(`Could not read weeks for week_id linking: ${weekErr.message}`);
  const weekIds = new Map((weekRows || []).map((w) => [`${w.week_number}|${w.year}`, w.id]));
  const linkedWeeks = weekKeys.filter((k) => weekIds.has(k)).length;

  const toInsert = [];
  const toUpdate = [];
  let unchanged = 0;

  for (const r of rows) {
    const { _lineNo, _weekLabel, ...clean } = r;
    const weekId = weekIds.get(`${clean.week_number}|${clean.year}`) || null;
    const prior = existing.get(keyOf(clean));
    if (!prior) {
      toInsert.push({ ...clean, company_id: companyId, week_id: weekId, seeded_at: new Date().toISOString() });
    } else if (differs(prior, clean)) {
      const patch = { week_id: weekId, seeded_at: new Date().toISOString() };
      for (const f of DERIVED_FIELDS) patch[f] = clean[f] ?? null;
      toUpdate.push({ id: prior.id, patch });
    } else {
      unchanged++;
    }
  }

  return { toInsert, toUpdate, unchanged, linkedWeeks, weekKeys };
}

// ---- Main --------------------------------------------------

async function main() {
  console.log("\n=== Seed calendar_slots ===");
  console.log(`Mode: ${opts.apply ? "APPLY (writes to Supabase)" : "DRY RUN (no writes)"}`);
  console.log(`Company slug: ${opts.companySlug}`);
  console.log(`Anchors: ${opts.strictAnchors ? "strict (reactive slots must carry an anchor)" : "reactive slots may defer their anchor"}`);
  console.log(`Files: ${opts.files.length}`);

  const missing = opts.files.filter((f) => !existsSync(f));
  if (missing.length) {
    console.error("\nCould not find these calendar files:");
    for (const f of missing) console.error(`  ${f}`);
    process.exit(1);
  }

  const results = opts.files.map((f) => parseCalendar(f, opts.year));
  for (const r of results) printParse(r);

  const allFailures = results.flatMap((r) => r.failures);
  const allRows = results.flatMap((r) => r.rows);

  console.log(`\n${"=".repeat(118)}`);
  console.log("TOTALS");
  console.log(`${"=".repeat(118)}`);
  for (const r of results) {
    console.log(`  ${pad(r.file, 34)} weeks ${pad(r.weeks.length, 5)} rows ${pad(r.rows.length, 6)} failures ${r.failures.length}`);
  }
  console.log(`  ${pad("ALL FILES", 34)} weeks ${pad(results.reduce((a, r) => a + r.weeks.length, 0), 5)} rows ${pad(allRows.length, 6)} failures ${allFailures.length}`);

  // Duplicate key check across files. Two calendars overlapping on
  // the same week and slot would silently overwrite each other.
  const seen = new Map();
  const dupes = [];
  for (const r of allRows) {
    const k = keyOf(r);
    if (seen.has(k)) dupes.push({ k, a: seen.get(k), b: r });
    else seen.set(k, r);
  }
  if (dupes.length) {
    console.log(`\n  DUPLICATE KEYS ACROSS FILES: ${dupes.length}`);
    for (const d of dupes) {
      console.log(`    ${d.k}  ${d.a.seeded_from}:${d.a._lineNo} vs ${d.b.seeded_from}:${d.b._lineNo}`);
    }
  }

  printFailures(allFailures);

  if (allFailures.length || dupes.length) {
    console.log("\nRefusing to continue. Fix the rows above, or the parser, then re-run.");
    process.exit(1);
  }

  if (!opts.apply) {
    if (!haveCreds) {
      console.log("\nNo Supabase credentials in .env.local, so new/changed counts were not calculated.");
      console.log("Parse is clean. Add credentials and re-run to see the write plan, then --apply.");
      return;
    }
    const supabase = createClient(supabaseUrl, serviceKey);
    const company = await resolveCompany(supabase);
    const plan = await persist(supabase, company.id, allRows);
    printPlan(plan);
    console.log("\nDry run. Re-run with --apply to write.");
    return;
  }

  if (!haveCreds) {
    console.error("\n--apply needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const company = await resolveCompany(supabase);
  const plan = await persist(supabase, company.id, allRows);
  printPlan(plan);

  if (plan.toInsert.length) {
    const chunk = 50;
    for (let i = 0; i < plan.toInsert.length; i += chunk) {
      const slice = plan.toInsert.slice(i, i + chunk);
      const { error } = await supabase.from("calendar_slots").insert(slice);
      if (error) throw new Error(`Insert failed at rows ${i} to ${i + slice.length}: ${error.message}`);
    }
    console.log(`  Inserted ${plan.toInsert.length}.`);
  }

  for (const u of plan.toUpdate) {
    const { error } = await supabase.from("calendar_slots").update(u.patch).eq("id", u.id);
    if (error) throw new Error(`Update failed for ${u.id}: ${error.message}`);
  }
  if (plan.toUpdate.length) console.log(`  Updated ${plan.toUpdate.length}.`);

  console.log("\nDone.");
}

async function resolveCompany(supabase) {
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("slug", opts.companySlug)
    .maybeSingle();
  if (error) {
    const hint = /invalid api key/i.test(error.message)
      ? " The keys in .env.local are rejected by the project. Legacy JWT keys may have been rotated or disabled. Refresh them from the Supabase dashboard under Project Settings, API Keys."
      : "";
    throw new Error(`Company lookup failed: ${error.message}.${hint}`);
  }
  if (!data) throw new Error(`No company with slug "${opts.companySlug}". Pass --company <slug>.`);
  console.log(`\nCompany: ${data.name} (${data.id})`);
  return data;
}

function printPlan(plan) {
  console.log("\nWRITE PLAN");
  console.log(`  insert    ${plan.toInsert.length}`);
  console.log(`  update    ${plan.toUpdate.length}`);
  console.log(`  unchanged ${plan.unchanged}`);
  console.log(`  weeks rows matched for week_id linking: ${plan.linkedWeeks} of ${plan.weekKeys.length}`);
  if (plan.linkedWeeks < plan.weekKeys.length) {
    console.log("  Unmatched weeks keep week_id null. Re-run the seed after the weeks rows exist to link them.");
  }
}

main().catch((err) => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
