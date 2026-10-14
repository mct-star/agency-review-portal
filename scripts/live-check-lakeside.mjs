#!/usr/bin/env node
/**
 * Live checks for the Lakeside trial build, run against the real Supabase
 * project and the real API keys in the portal's env, inside a scratch company
 * named "Live check scratch" with a scratch test user.
 *
 *   node scripts/live-check-lakeside.mjs preflight   no network: tools, files, which env NAMES are set
 *   node scripts/live-check-lakeside.mjs run         checks 1 to 6, in order
 *   node scripts/live-check-lakeside.mjs cleanup     deletes exactly what the state file lists
 *
 * Rules this script keeps:
 *  - It never prints, logs or writes a key, token or password, not even in
 *    part. Everything printed passes through redact(). A missing variable is
 *    reported by NAME only.
 *  - Every id it creates (company, user, rows, storage keys) goes into
 *    scripts/.live-check-state.json the moment it exists. Cleanup deletes by
 *    those ids and keys only. No pattern deletes.
 *  - The app is exercised through its own routes, as the scratch user, on a
 *    local `next dev` this script starts and stops. Email is switched off for
 *    that server (RESEND_API_KEY is blanked) so nothing is sent to anyone.
 *
 * Optional environment:
 *   LIVE_CHECK_ENV_FILE      path to the env file (default: <repo>/.env.local)
 *   LIVE_CHECK_PORT          port for the local server (default: a free one)
 *   LIVE_CHECK_VIDEO_BYTES   size of the big clip (default 1000000000)
 *   LIVE_CHECK_PHOTOS        colon-separated photo paths, instead of searching ~/Downloads
 *   LIVE_CHECK_CLIP          path of the short video for check 2
 *   LIVE_CHECK_BUDGET_GBP    spend ceiling (default 2)
 */
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const STATE_FILE = path.join(HERE, ".live-check-state.json");
const RAW_LOG = path.join(HERE, ".live-check-tagger-raw.jsonl");
const EXPORT_FILE = path.join(HERE, ".live-check-export.csv");
const SCRATCH_NAME = "Live check scratch";
const GB = 1024 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Secrets: never printed
// ---------------------------------------------------------------------------

const SECRET_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "CRON_SECRET",
  "GOOGLE_GEMINI_API_KEY", "Gemini", "GEMINI_API_KEY", "GEMINI",
  "ANTHROPIC_API_KEY", "Anthropic", "OPENAI_API_KEY", "RESEND_API_KEY",
];
const extraSecrets = new Map(); // minted at run time: scratch password, signed tokens

export function redact(text, env = process.env) {
  let out = String(text ?? "");
  const pairs = [...SECRET_NAMES.map((n) => [n, env[n]]), ...extraSecrets];
  for (const [name, value] of pairs) {
    if (typeof value === "string" && value.length >= 8) out = out.split(value).join(`[redacted:${name}]`);
  }
  return out
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[redacted:jwt]")
    .replace(/([?&](?:key|token|apikey)=)[^&\s"']+/gi, "$1[redacted]");
}

const say = (...parts) => console.log(redact(parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p, null, 2))).join(" ")));
const rule = (t) => say(`\n${"=".repeat(8)} ${t} ${"=".repeat(Math.max(3, 70 - t.length))}`);

// ---------------------------------------------------------------------------
// Small pure helpers (tested in src/lib/live-check.test.ts)
// ---------------------------------------------------------------------------

/** Read the fixed tag vocabulary from the app's own source, so there is one list. */
export function extractVocabulary(source) {
  const block = /export const TAG_VOCABULARY = \{([\s\S]*?)\} as const;/.exec(source);
  if (!block) throw new Error("Could not find TAG_VOCABULARY in src/lib/media/vocabulary.ts");
  const vocab = {};
  for (const m of block[1].matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
    vocab[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  }
  return vocab;
}

/** Check one raw tagger reply against the fixed vocabulary. Returns offenders by field. */
export function checkTaggerJson(raw, vocab) {
  const offenders = [];
  let obj;
  try {
    obj = JSON.parse(String(raw).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""));
  } catch {
    return { ok: false, offenders: ["not valid JSON"], obj: null };
  }
  const groups = { weather: "weather", place: "place", subject: "subject", time_of_day: "time" };
  for (const [field, group] of Object.entries(groups)) {
    // The parser accepts an array, a single string or null for each group
    // and wraps or drops accordingly; the check mirrors that.
    const value = obj[field];
    const list = Array.isArray(value) ? value : typeof value === "string" ? [value] : value == null ? [] : null;
    if (list === null) { offenders.push(`${field}: not an array or a string`); continue; }
    for (const v of list) if (!vocab[group]?.includes(v)) offenders.push(`${field}: "${v}" is not in the vocabulary`);
  }
  if (typeof obj.people_present !== "boolean") offenders.push("people_present: not a boolean");
  if (typeof obj.text_space !== "boolean") offenders.push("text_space: not a boolean");
  if (typeof obj.scene !== "string" || !obj.scene.trim()) offenders.push("scene: empty");
  // The parser cuts the scene to 160 characters when it stores it, so a
  // longer raw reply is noted but is not a failure.
  else if (obj.scene.length > 160) say(`  note: ${obj.scene.length}-character scene will be cut to 160`);
  return { ok: offenders.length === 0, offenders, obj };
}

const dashClass = () => new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`);
const emojiRe = () => new RegExp("[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{FE0F}\\u{200D}]", "u");
const AMERICAN = /\b(colou?rs?\b(?<!colour|colours)|color\w*|flavor\w*|favorite\w*|neighbor\w*|organiz\w*|center(?:s|ed)?\b|theater\w*|gray\b|realiz\w*|recogniz\w*|specializ\w*|traveler\w*|cozy|licen[sc]ed?\b(?<!licensed))/i;
const LINKEDIN_TONE = /linkedin|professional network|thought leader|excited to (?:announce|share)|delighted to|synergy|stakeholder|\bB2B\b|personal brand/i;
const FIGURE_RE = /£\s?\d+(?:[.,]\d+)?|\b\d{1,2}(?:[:.]\d{2})?\s?(?:am|pm)\b|\b\d+(?:[.,]\d+)?\s?%|\b\d{1,2}(?:st|nd|rd|th)\b|\b\d+(?:[.,]\d+)?\b/gi;

/** The house rules for a hospitality caption. */
export function assessCaption(text, { allowEmoji = false, brief = "" } = {}) {
  const problems = [];
  if (dashClass().test(text)) problems.push("contains a long dash");
  if (!allowEmoji && emojiRe().test(text)) problems.push("contains an emoji");
  const am = AMERICAN.exec(text);
  if (am) problems.push(`American spelling: "${am[0]}"`);
  if (LINKEDIN_TONE.test(text)) problems.push("LinkedIn or corporate framing");
  const paras = text.trim().split(/\n\s*\n/);
  const last = (paras[paras.length - 1] || "").trim().split(/\s+/).filter(Boolean);
  const tagBlock = last.length >= 3 && last.every((t) => /^#[A-Za-z0-9_]+$/.test(t));
  if (!tagBlock) problems.push("no hashtag block of three or more at the end");
  const first = text.split("\n")[0] || "";
  if (first.length > 110) problems.push(`first line is ${first.length} characters`);
  const allowed = new Set((brief.match(FIGURE_RE) || []).map((f) => f.toLowerCase().replace(/\s+/g, "")));
  const digitsAllowed = new Set([...allowed].flatMap((f) => f.match(/\d+(?:[.,]\d+)?/g) || []));
  const unsupported = [...new Set((text.match(FIGURE_RE) || []).filter((f) => {
    const n = f.toLowerCase().replace(/\s+/g, "");
    if (allowed.has(n)) return false;
    const d = n.match(/\d+(?:[.,]\d+)?/g) || [];
    return !(d.length && d.every((x) => digitsAllowed.has(x)));
  }))];
  return { pass: problems.length === 0, problems, unsupportedFigures: unsupported, firstLine: first };
}

/** An MP4 `free` box of exactly `total` bytes (8 byte header, then zeros): valid padding. */
export function freeBoxHeader(total) {
  if (total < 8 || total > 0xffffffff) throw new Error("free box size out of range");
  const h = Buffer.alloc(8);
  h.writeUInt32BE(total, 0);
  h.write("free", 4, "ascii");
  return h;
}

export class Budget {
  constructor(limitGbp) { this.limit = limitGbp; this.total = 0; this.lines = {}; }
  /** Add an estimated cost; returns false (and does not add) if it would pass the limit. */
  add(kind, count, unitGbp) {
    const cost = count * unitGbp;
    if (this.total + cost > this.limit) return false;
    this.total += cost;
    this.lines[kind] = (this.lines[kind] || { count: 0, gbp: 0 });
    this.lines[kind].count += count;
    this.lines[kind].gbp += cost;
    return true;
  }
}
// Deliberately generous per-call estimates in GBP. Real use is a fraction of this.
const UNIT = { vision: 0.004, write: 0.012, plan: 0.015, transcribe: 0.02 };

const PHOTO_EXT = /\.(jpe?g|png|webp)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i;
const AVOID_NAME = /(face|portrait|headshot|selfie|team|staff|people|person|michael|mct|profile|avatar|passport|licen[cs]e|id[-_ ]?card|screenshot|scan)/i;
const AVOID_PATH = /(finance|invoice|bank|payroll|passport|personal|security|statement|receipt|tax|contract|medical|kids|family)/i;
const SCENE_HINT = /(office|exterior|lake|garden|food|menu|venue|building|landscape|scene|product|stock|restaurant|bar|terrace|street|nature|sky|interior)/i;

export function walkFiles(root, { maxDepth = 4, skip = /(^|\/)(node_modules|\.git|Library)(\/|$)/ } = {}) {
  const out = [];
  const go = (dir, depth) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (skip.test(full)) continue;
      if (e.isDirectory()) { if (depth < maxDepth) go(full, depth + 1); }
      else if (e.isFile()) { try { out.push({ file: full, size: fs.statSync(full).size }); } catch { /* ignore */ } }
    }
  };
  go(root, 0);
  return out;
}

/** Five photos of varied scenes: not obviously people, not obviously personal, spread over folders. */
export function choosePhotos(files, count = 5) {
  const ok = files.filter((f) => PHOTO_EXT.test(f.file) && f.size >= 150_000 && f.size <= 20_000_000
    && !AVOID_NAME.test(path.basename(f.file)) && !AVOID_PATH.test(f.file));
  const scored = ok.map((f) => ({ ...f, score: (SCENE_HINT.test(f.file) ? 2 : 0) })).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  const picked = []; const dirs = new Set();
  for (const f of scored) { const d = path.dirname(f.file); if (!dirs.has(d)) { dirs.add(d); picked.push(f); } if (picked.length === count) break; }
  for (const f of scored) { if (picked.length === count) break; if (!picked.includes(f)) picked.push(f); }
  return picked;
}

/** A short real video: smallest between 1 MB and 150 MB. */
export function chooseClip(files) {
  return files.filter((f) => VIDEO_EXT.test(f.file) && f.size >= 1_000_000 && f.size <= 150_000_000 && !AVOID_NAME.test(path.basename(f.file)) && !AVOID_PATH.test(f.file))
    .sort((a, b) => a.size - b.size)[0] || null;
}

// ---------------------------------------------------------------------------
// State: every id recorded the moment it exists
// ---------------------------------------------------------------------------

function emptyState() {
  return { version: 1, createdAt: new Date().toISOString(), companyId: null, userId: null, userEmail: null,
    inventoryIds: [], pieceIds: [], weekIds: [], weatherRunIds: [], notificationIds: [],
    storage: { captures: [], "content-assets": [] }, buckets: [], localFiles: [] };
}
function loadState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return null; } }
let state = loadState() || emptyState();
function saveState() { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 }); }
function record(kind, value) {
  if (value == null) return;
  if (kind === "companyId" || kind === "userId" || kind === "userEmail") state[kind] = value;
  else if (kind === "captures" || kind === "content-assets") { if (!state.storage[kind].includes(value)) state.storage[kind].push(value); }
  else if (!state[kind].includes(value)) state[kind].push(value);
  saveState();
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

async function loadEnv() {
  const file = process.env.LIVE_CHECK_ENV_FILE || path.join(ROOT, ".env.local");
  const dotenv = (await import("dotenv")).default;
  const r = dotenv.config({ path: file, quiet: true, override: false });
  if (r.error) say(`Env file not readable: ${file} (${r.error.code || "error"})`);
  return file;
}
function envProblems() {
  const missing = [];
  for (const n of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"]) if (!process.env[n]) missing.push(n);
  const gem = ["GOOGLE_GEMINI_API_KEY", "GEMINI_API_KEY", "Gemini", "GEMINI"].some((n) => process.env[n]);
  const ant = ["ANTHROPIC_API_KEY", "Anthropic"].some((n) => process.env[n]);
  if (!gem && !ant) missing.push("one of GOOGLE_GEMINI_API_KEY, GEMINI_API_KEY, Gemini, GEMINI, ANTHROPIC_API_KEY, Anthropic");
  return missing;
}
const which = (cmd) => spawnSync("which", [cmd], { encoding: "utf8" }).status === 0;

// ---------------------------------------------------------------------------
// Network helpers: timeouts and plain errors on every step
// ---------------------------------------------------------------------------

let base = "";
let cookieHeader = "";
const results = [];
const budget = new Budget(Number(process.env.LIVE_CHECK_BUDGET_GBP) || 2);

async function http(method, p, { json, form, headers = {}, auth = true, timeoutMs = 180_000 } = {}) {
  const h = { ...headers };
  if (auth && cookieHeader) h.cookie = cookieHeader;
  let body;
  if (json !== undefined) { h["content-type"] = "application/json"; body = JSON.stringify(json); }
  if (form) body = form;
  let res;
  try {
    res = await fetch(base + p, { method, headers: h, body, signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
  } catch (err) {
    throw new Error(`${method} ${p}: ${err?.name === "TimeoutError" ? `no answer within ${Math.round(timeoutMs / 1000)}s` : err?.message || "network error"}`);
  }
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, ok: res.ok, data, text, headers: res.headers };
}
const must = (r, what) => { if (!r.ok) throw new Error(`${what}: HTTP ${r.status} ${redact(r.data?.error || r.text.slice(0, 200))}`); return r; };

async function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on("error", reject);
  });
}

let devChild = null;
const devTail = [];
async function startDev() {
  const port = Number(process.env.LIVE_CHECK_PORT) || await freePort();
  base = `http://localhost:${port}`;
  fs.writeFileSync(RAW_LOG, "");
  devChild = spawn("npx", ["next", "dev", "-p", String(port)], {
    cwd: ROOT,
    // RESEND_API_KEY is blanked so no email is sent to anyone during the checks.
    env: { ...process.env, RESEND_API_KEY: "", NEXT_PUBLIC_APP_URL: base, TAG_RAW_LOG_FILE: RAW_LOG, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const keep = (b) => { for (const l of String(b).split("\n")) if (l.trim()) { devTail.push(l); if (devTail.length > 200) devTail.shift(); } };
  devChild.stdout.on("data", keep); devChild.stderr.on("data", keep);
  const t0 = Date.now();
  for (;;) {
    if (devChild.exitCode !== null) throw new Error(`The local server stopped: ${redact(devTail.slice(-5).join(" | "))}`);
    try { const r = await fetch(`${base}/login`, { signal: AbortSignal.timeout(20_000) }); if (r.status < 500) break; } catch { /* not up yet */ }
    if (Date.now() - t0 > 240_000) throw new Error("The local server did not start within 4 minutes");
    await new Promise((r) => setTimeout(r, 1500));
  }
  say(`Local server up on ${base}`);
}
function stopDev() { try { devChild?.kill("SIGTERM"); } catch { /* already gone */ } }
process.on("exit", stopDev);
process.on("SIGINT", () => { stopDev(); process.exit(130); });

// ---------------------------------------------------------------------------
// Supabase: service client for the scratch rows, and a session for the scratch user
// ---------------------------------------------------------------------------

let svc = null;
let scratchPassword = "";
async function serviceClient() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function signIn() {
  const { createServerClient } = await import("@supabase/ssr");
  const jar = new Map();
  const c = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)) },
  });
  const { error } = await c.auth.signInWithPassword({ email: state.userEmail, password: scratchPassword });
  if (error) throw new Error(`Could not sign the scratch user in: ${redact(error.message)}`);
  cookieHeader = [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
  for (const [, v] of jar) extraSecrets.set("session-cookie", v);
}

async function checkMigrations() {
  const probes = [
    ["039", () => svc.from("photo_inventory").select("status, thumb_path, poster_path, people_present, auto_tagged_at").limit(1)],
    ["039", () => svc.from("companies").select("staff_upload_token, staff_upload_enabled").limit(1)],
    ["040", () => svc.from("companies").select("post_pack, social_networks, hospitality_settings").limit(1)],
    ["040", () => svc.from("content_pieces").select("auto_source, source_meta").limit(1)],
    ["041", () => svc.from("companies").select("postcode, latitude, longitude, timezone, weather_post_enabled, weather_post_time, weather_post_for").limit(1)],
    ["041", () => svc.from("weather_post_runs").select("id").limit(1)],
  ];
  const missing = new Set();
  for (const [n, q] of probes) { const { error } = await q(); if (error) missing.add(`${n} (${redact(error.message)})`); }
  if (missing.size) throw new Error(`Migration not applied: ${[...missing].join("; ")}`);
}

async function createScratch() {
  if (state.companyId) throw new Error(`A previous run left ${SCRATCH_NAME} in the state file. Run cleanup first.`);
  const stamp = Date.now();
  const { data: company, error } = await svc.from("companies").insert({
    name: SCRATCH_NAME, slug: `live-check-scratch-${stamp}`, plan: "pro", post_pack: "hospitality",
    social_networks: ["facebook", "instagram"], industry: "hospitality",
    hospitality_settings: { venue_notes: "A restaurant and bar beside a lake, with a covered terrace and a garden.", standing_hashtags: [], allow_emoji: false },
  }).select("id").single();
  if (error) throw new Error(`Could not create the scratch company: ${redact(error.message)}`);
  record("companyId", company.id);

  scratchPassword = crypto.randomBytes(18).toString("base64url");
  extraSecrets.set("scratch-password", scratchPassword);
  const email = `live-check-scratch-${stamp}@agencybristol.com`;
  const { data: au, error: ae } = await svc.auth.admin.createUser({ email, password: scratchPassword, email_confirm: true });
  if (ae) throw new Error(`Could not create the scratch user: ${redact(ae.message)}`);
  record("userId", au.user.id); record("userEmail", email);
  const { error: ue } = await svc.from("users").insert({ id: au.user.id, email, full_name: "Live check", role: "client", company_id: company.id });
  if (ue) throw new Error(`Could not link the scratch user: ${redact(ue.message)}`);
  say(`Scratch company ${company.id} and user ${au.user.id} created and recorded.`);
}

// ---------------------------------------------------------------------------
// Media helpers
// ---------------------------------------------------------------------------

const sha256File = (file) => new Promise((resolve, reject) => {
  const h = crypto.createHash("sha256");
  fs.createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
});
const mimeOf = (f) => ({ ".png": "image/png", ".webp": "image/webp", ".mov": "video/quicktime", ".webm": "video/webm" })[path.extname(f).toLowerCase()] || (VIDEO_EXT.test(f) ? "video/mp4" : "image/jpeg");

function ffprobeInfo(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file], { encoding: "utf8" });
  try { const j = JSON.parse(r.stdout); return { width: j.streams?.[0]?.width ?? null, height: j.streams?.[0]?.height ?? null, duration: Number(j.format?.duration) || null }; } catch { return { width: null, height: null, duration: null }; }
}
function extractFrames(file, duration) {
  if (!which("ffmpeg") || !duration) return [];
  const times = [Math.min(0.3, duration * 0.05), duration / 2, Math.max(duration - 0.3, duration * 0.95)];
  const frames = [];
  for (const t of times) {
    const r = spawnSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "6", "-f", "image2pipe", "-vcodec", "mjpeg", "-"], { maxBuffer: 20_000_000 });
    if (r.status === 0 && r.stdout.length > 1000 && r.stdout.length < 450_000) frames.push(`data:image/jpeg;base64,${r.stdout.toString("base64")}`);
  }
  return frames;
}

async function makeBigVideo(targetBytes) {
  const out = path.join(os.tmpdir(), `live-check-${Date.now()}.mp4`);
  if (which("ffmpeg")) {
    const r = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30", "-t", "20", "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "6M", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", out], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`ffmpeg could not make the test video: ${redact(r.stderr.slice(0, 300))}`);
    record("localFiles", out);
    const have = fs.statSync(out).size;
    if (have < targetBytes) {
      // Pad with a valid MP4 'free' box to reach the target size exactly.
      const pad = targetBytes - have;
      const fd = fs.openSync(out, "a");
      fs.writeSync(fd, freeBoxHeader(pad));
      const zeros = Buffer.alloc(8 * 1024 * 1024);
      let left = pad - 8;
      while (left > 0) { const n = Math.min(left, zeros.length); fs.writeSync(fd, zeros, 0, n); left -= n; }
      fs.closeSync(fd);
    }
    return { file: out, source: `ffmpeg synthetic test pattern (20 s), padded with an MP4 free box to ${fs.statSync(out).size} bytes` };
  }
  const dl = path.join(os.homedir(), "Downloads");
  const biggest = walkFiles(dl).filter((f) => VIDEO_EXT.test(f.file) && f.size <= 1.9 * GB && !AVOID_PATH.test(f.file)).sort((a, b) => b.size - a.size)[0];
  if (!biggest) throw new Error("ffmpeg is not on PATH and there is no video under ~/Downloads to use");
  return { file: biggest.file, source: `largest video under ~/Downloads (ffmpeg not on PATH): ${biggest.file}` };
}

async function listAll(bucket, prefix) {
  const keys = [];
  const go = async (p) => {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await svc.storage.from(bucket).list(p, { limit: 100, offset });
      if (error || !data || data.length === 0) return;
      for (const e of data) { if (e.id) keys.push(p ? `${p}/${e.name}` : e.name); else await go(p ? `${p}/${e.name}` : e.name); }
      if (data.length < 100) return;
    }
  };
  await go(prefix);
  return keys;
}
async function reconcileStorageAndRows() {
  if (!state.companyId) return;
  const cid = state.companyId;
  for (const k of await listAll("captures", cid)) record("captures", k);
  for (const k of await listAll("content-assets", `images/${cid}`)) record("content-assets", k);
  for (const k of await listAll("content-assets", `videos/${cid}`)) record("content-assets", k);
  const grab = async (table, kind, col = "company_id") => {
    const { data } = await svc.from(table).select("id").eq(col, cid);
    for (const r of data || []) record(kind, r.id);
  };
  await grab("photo_inventory", "inventoryIds"); await grab("content_pieces", "pieceIds");
  await grab("weeks", "weekIds"); await grab("weather_post_runs", "weatherRunIds");
  if (state.userId) { const { data } = await svc.from("notifications").select("id").eq("recipient_user_id", state.userId); for (const r of data || []) record("notificationIds", r.id); }
}

// ---------------------------------------------------------------------------
// Uploads through the app's own routes
// ---------------------------------------------------------------------------

async function waitFor(fn, { timeoutMs = 120_000, everyMs = 2000, what = "condition" } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${what}`);
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

async function uploadPhoto(file) {
  const buf = fs.readFileSync(file);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const mime = mimeOf(file);
  const sharp = (await import("sharp")).default;
  const meta = await sharp(buf, { failOn: "none" }).metadata();
  const turned = (meta.orientation ?? 1) >= 5;
  await signIn();
  const sign = must(await http("POST", "/api/upload/sign", { json: { companyId: state.companyId, kind: "photo", filename: path.basename(file), mimeType: mime, sizeBytes: buf.length, sha256: sha } }), "sign photo");
  if (sign.data.alreadyExists) return { file, sha, alreadyExists: true };
  record("captures", sign.data.path);
  extraSecrets.set("signed-token", sign.data.token);
  let put;
  try {
    put = await fetch(sign.data.signedUrl, { method: "PUT", headers: { "content-type": mime, "x-upsert": "false", "cache-control": "max-age=3600" }, body: buf, signal: AbortSignal.timeout(300_000) });
  } catch (e) { throw new Error(`Upload of ${path.basename(file)}: ${e?.message}`); }
  if (!put.ok) throw new Error(`Upload of ${path.basename(file)} was refused (HTTP ${put.status})`);
  const reg = must(await http("POST", "/api/media/register", { json: {
    companyId: state.companyId, kind: "photo", bucket: sign.data.bucket, path: sign.data.path, mimeType: mime, sizeBytes: buf.length,
    originalFilename: path.basename(file), sha256: sha, width: turned ? meta.height : meta.width, height: turned ? meta.width : meta.height,
    durationSeconds: null, weekNumber: null, target: { type: "photo_bank", source: "bank_upload" }, frames: [] } }), "register photo");
  record("inventoryIds", reg.data.photo?.id);
  return { file, sha, id: reg.data.photo?.id, path: sign.data.path };
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

function pass(n, name, notes) { results.push({ n, name, status: "PASS" }); say(`\nCHECK ${n} PASS: ${name}`); for (const l of [].concat(notes || [])) say("  " + l); }
function fail(n, name, err, notes) { results.push({ n, name, status: "FAIL", error: redact(String(err?.message || err)) }); say(`\nCHECK ${n} FAIL: ${name}\n  Error: ${redact(String(err?.message || err))}`); for (const l of [].concat(notes || [])) say("  " + l); }
function skip(n, name, why) { results.push({ n, name, status: "SKIP", error: why }); say(`\nCHECK ${n} SKIP: ${name}\n  Reason: ${why}`); }

let vocab = null;
const photoRows = []; // { file, id, path } for check 2/3/6
const captions = {};  // type -> text

async function check1() {
  const name = "Resumable upload of a large video, interrupted at about 40 percent and resumed";
  rule("CHECK 1 " + name);
  const tus = await import("tus-js-client");
  const targetBytes = Number(process.env.LIVE_CHECK_VIDEO_BYTES) || 1_000_000_000;
  if (targetBytes > 1.8 * GB) throw new Error("LIVE_CHECK_VIDEO_BYTES must be under 1.8 GB (the clip is held in memory for the upload)");
  const big = await makeBigVideo(targetBytes);
  say("Test clip:", big.source);
  const size = fs.statSync(big.file).size;
  if (size > 1.9 * GB) throw new Error("The clip is over 1.9 GB, which this runner will not hold in memory");
  say(`Hashing ${size} bytes...`);
  const sha = await sha256File(big.file);
  say("Local sha256:", sha);
  const info = ffprobeInfo(big.file);

  await signIn();
  const sign = must(await http("POST", "/api/upload/sign", { json: { companyId: state.companyId, kind: "video", filename: "live-check-big.mp4", mimeType: "video/mp4", sizeBytes: size, sha256: sha } }), "sign video");
  record("captures", sign.data.path);
  extraSecrets.set("signed-token", sign.data.token);
  say("Signed. Object key:", sign.data.path, "| resumable endpoint host:", new URL(sign.data.tusEndpoint).host);

  const data = fs.readFileSync(big.file); // Buffer: cheap to slice, resumes cleanly
  const mk = (extra) => new tus.Upload(data, {
    endpoint: sign.data.tusEndpoint, chunkSize: 6 * 1024 * 1024, retryDelays: [0, 3000, 5000, 10000, 20000],
    metadata: { bucketName: "captures", objectName: sign.data.path, contentType: "video/mp4", cacheControl: "3600" },
    onBeforeRequest: (req) => { req.setHeader("x-signature", sign.data.token); }, ...extra,
  });

  // Phase 1: upload until about 40 percent, then stop dead.
  let firstUrl = null; let abortedAt = 0;
  await new Promise((resolve, reject) => {
    const up = mk({
      onError: reject,
      onProgress: (sent, total) => {
        const pct = Math.floor((sent / total) * 100);
        if (pct % 10 === 0 && pct !== up._lastPct) { up._lastPct = pct; say(`  phase 1: ${pct}%`); }
        if (sent >= total * 0.4 && !abortedAt) { abortedAt = sent; firstUrl = up.url; up.abort(false).then(resolve, reject); }
      },
      onSuccess: () => reject(new Error("The upload finished before it could be interrupted; use a larger LIVE_CHECK_VIDEO_BYTES")),
    });
    up.start();
  });
  say(`Interrupted after ${abortedAt} bytes sent (${((abortedAt / size) * 100).toFixed(1)}%). Upload URL kept.`);

  // What does the server hold now?
  const head = await fetch(firstUrl, { method: "HEAD", headers: { "tus-resumable": "1.0.0", "x-signature": sign.data.token }, signal: AbortSignal.timeout(60_000) });
  const offset = Number(head.headers.get("upload-offset"));
  say(`Server reports it holds ${offset} bytes (HEAD ${head.status}).`);
  if (!(offset > 0 && offset < size)) throw new Error(`After the interruption the server offset was ${offset}, expected between 0 and ${size}`);

  // Phase 2: resume from the stored upload URL.
  await new Promise((resolve, reject) => {
    const up = mk({ uploadUrl: firstUrl, onError: reject, onSuccess: resolve,
      onProgress: (sent, total) => { const pct = Math.floor((sent / total) * 100); if (pct % 10 === 0 && pct !== up._lastPct) { up._lastPct = pct; say(`  phase 2: ${pct}%`); } } });
    up.start();
  });
  say(`Resumed from ${offset} and finished; ${size - offset} bytes sent in phase 2.`);

  // Register as the library would, with frames taken from the clip.
  const frames = extractFrames(big.file, info.duration);
  const reg = must(await http("POST", "/api/media/register", { timeoutMs: 300_000, json: {
    companyId: state.companyId, kind: "video", bucket: "captures", path: sign.data.path, mimeType: "video/mp4", sizeBytes: size,
    originalFilename: "live-check-big.mp4", sha256: sha, width: info.width, height: info.height, durationSeconds: info.duration,
    weekNumber: null, target: { type: "photo_bank", source: "bank_upload" }, frames } }), "register video");
  const id = reg.data.photo?.id; record("inventoryIds", id);
  if (frames.length) budget.add("vision", 1, UNIT.vision); // the register call starts one tagging call

  // Size in storage.
  const slash = sign.data.path.lastIndexOf("/");
  const { data: listing } = await svc.storage.from("captures").list(sign.data.path.slice(0, slash), { search: sign.data.path.slice(slash + 1), limit: 5 });
  const stored = listing?.find((e) => e.name === sign.data.path.slice(slash + 1));
  const storedSize = stored?.metadata?.size;
  say(`Stored object size: ${storedSize} (local ${size})`);

  // Hash of what is in storage, streamed back.
  const { data: signed } = await svc.storage.from("captures").createSignedUrl(sign.data.path, 3600);
  extraSecrets.set("signed-url", signed.signedUrl);
  say("Downloading the stored object to hash it...");
  const res = await fetch(signed.signedUrl, { signal: AbortSignal.timeout(2 * 60 * 60 * 1000) });
  if (!res.ok) throw new Error(`Could not read the stored object back (HTTP ${res.status})`);
  const h = crypto.createHash("sha256"); let got = 0;
  for await (const chunk of res.body) { h.update(chunk); got += chunk.length; }
  const storedSha = h.digest("hex");
  say("Stored sha256:", storedSha, `(${got} bytes read)`);

  const { data: row } = await svc.from("photo_inventory").select("id, kind, size_bytes, file_ref, storage_path, status, poster_path, thumb_path").eq("id", id).maybeSingle();
  say("Inventory row:", row);

  // Dedupe on the same hash.
  const again = await http("POST", "/api/upload/sign", { json: { companyId: state.companyId, kind: "video", filename: "again.mp4", mimeType: "video/mp4", sizeBytes: size, sha256: sha } });

  const problems = [];
  if (storedSize !== size) problems.push(`size mismatch: stored ${storedSize}, local ${size}`);
  if (storedSha !== sha) problems.push("sha256 mismatch between local file and stored object");
  if (!row) problems.push("no photo_inventory row");
  else {
    if (row.size_bytes !== size) problems.push(`row size_bytes ${row.size_bytes} != ${size}`);
    if (row.file_ref !== `sha256:${sha}`) problems.push(`row file_ref ${row.file_ref}`);
    if (row.kind !== "video") problems.push(`row kind ${row.kind}`);
  }
  if (!again.data?.alreadyExists) problems.push("a second sign with the same hash did not answer alreadyExists");
  if (problems.length) throw new Error(problems.join("; "));
  if (row?.poster_path) record("captures", row.poster_path);
  pass(1, name, [`size ${size}, sha256 ${sha}`, `interrupted at ${abortedAt} bytes, server held ${offset}, resumed and completed`, "stored object size and sha256 match the local file", `inventory row ${id} written`, "same-hash second upload answered 'already in the library'"]);
}

async function check2and3() {
  const name2 = "Auto-tagging: five photos and one short video, every value inside the fixed vocabulary";
  rule("CHECK 2 " + name2);
  vocab = extractVocabulary(fs.readFileSync(path.join(ROOT, "src/lib/media/vocabulary.ts"), "utf8"));
  say("Vocabulary:", vocab);
  const dl = path.join(os.homedir(), "Downloads");
  const all = [...walkFiles(dl), ...walkFiles(path.join(ROOT, "public"), { maxDepth: 3 })];
  const photos = process.env.LIVE_CHECK_PHOTOS
    ? process.env.LIVE_CHECK_PHOTOS.split(":").filter(Boolean).map((file) => ({ file, size: fs.statSync(file).size }))
    : choosePhotos(all);
  if (photos.length < 5) throw new Error(`Only ${photos.length} suitable photos found. Set LIVE_CHECK_PHOTOS to five paths.`);
  const clipFile = process.env.LIVE_CHECK_CLIP || chooseClip(all)?.file || null;
  say("Photos used:"); for (const p of photos) say("  -", p.file, `(${p.size} bytes)`);
  say("Short video used:", clipFile || "none found: a synthetic 6 s clip will be made");

  const items = [];
  // Photos one at a time, so each raw tagger reply can be matched to its file.
  for (const p of photos) {
    if (!budget.add("vision", 1, UNIT.vision)) throw new Error("Spend ceiling reached before tagging finished");
    const before = fs.readFileSync(RAW_LOG, "utf8").split("\n").filter(Boolean).length;
    const up = await uploadPhoto(p.file);
    if (up.alreadyExists) { say(`  ${path.basename(p.file)}: already in the library (skipped)`); continue; }
    const row = await waitFor(async () => {
      const { data } = await svc.from("photo_inventory").select("*").eq("id", up.id).maybeSingle();
      return data && (data.auto_tagged_at || data.auto_tag_error) ? data : null;
    }, { timeoutMs: 120_000, what: `tags for ${path.basename(p.file)}` });
    const raw = fs.readFileSync(RAW_LOG, "utf8").split("\n").filter(Boolean).slice(before);
    items.push({ file: p.file, id: up.id, row, raw });
    photoRows.push({ file: p.file, id: up.id });
    if (row.thumb_path) record("captures", row.thumb_path);
  }

  // The short video, with frames from ffmpeg standing in for the browser.
  let clip = clipFile;
  if (!clip && which("ffmpeg")) {
    clip = path.join(os.tmpdir(), `live-check-short-${Date.now()}.mp4`);
    spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24", "-t", "6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", clip]);
    record("localFiles", clip);
  }
  if (clip) {
    if (!budget.add("vision", 1, UNIT.vision)) throw new Error("Spend ceiling reached before the clip");
    const before = fs.readFileSync(RAW_LOG, "utf8").split("\n").filter(Boolean).length;
    const buf = fs.readFileSync(clip); const sha = crypto.createHash("sha256").update(buf).digest("hex");
    const info = ffprobeInfo(clip); const mime = mimeOf(clip);
    await signIn();
    const sign = must(await http("POST", "/api/upload/sign", { json: { companyId: state.companyId, kind: "video", filename: path.basename(clip), mimeType: mime, sizeBytes: buf.length, sha256: sha } }), "sign clip");
    record("captures", sign.data.path);
    extraSecrets.set("signed-token", sign.data.token);
    const put = await fetch(sign.data.signedUrl, { method: "PUT", headers: { "content-type": mime, "x-upsert": "false" }, body: buf, signal: AbortSignal.timeout(600_000) });
    if (!put.ok) throw new Error(`Upload of the clip was refused (HTTP ${put.status})`);
    const reg = must(await http("POST", "/api/media/register", { timeoutMs: 180_000, json: { companyId: state.companyId, kind: "video", bucket: "captures", path: sign.data.path, mimeType: mime, sizeBytes: buf.length, originalFilename: path.basename(clip), sha256: sha, width: info.width, height: info.height, durationSeconds: info.duration, weekNumber: null, target: { type: "photo_bank", source: "bank_upload" }, frames: extractFrames(clip, info.duration) } }), "register clip");
    record("inventoryIds", reg.data.photo?.id);
    const row = await waitFor(async () => { const { data } = await svc.from("photo_inventory").select("*").eq("id", reg.data.photo.id).maybeSingle(); return data && (data.auto_tagged_at || data.auto_tag_error) ? data : null; }, { timeoutMs: 120_000, what: "tags for the clip" });
    items.push({ file: clip, id: reg.data.photo.id, row, raw: fs.readFileSync(RAW_LOG, "utf8").split("\n").filter(Boolean).slice(before) });
    if (row.poster_path) record("captures", row.poster_path);
  }

  const offenders = [];
  for (const it of items) {
    say(`\n  ${path.basename(it.file)} (${it.row.kind})`);
    if (it.raw.length === 0) say("    raw tagger reply: none logged");
    for (const line of it.raw) {
      const r = JSON.parse(line);
      say(`    raw reply from ${r.provider} (${r.images} image${r.images === 1 ? "" : "s"}):`);
      say("    " + r.text.replace(/\n/g, "\n    "));
      const v = checkTaggerJson(r.text, vocab);
      say(`    vocabulary check: ${v.ok ? "all values inside the vocabulary" : "OUTSIDE: " + v.offenders.join("; ")}`);
      for (const o of v.offenders) offenders.push(`${path.basename(it.file)}: ${o}`);
    }
    say("    stored:", { tags: it.row.tags, scene_label: it.row.scene_label, people_present: it.row.people_present, text_space: it.row.text_space, auto_tag_error: it.row.auto_tag_error });
    if (it.row.auto_tag_error) offenders.push(`${path.basename(it.file)}: tagging failed (${redact(it.row.auto_tag_error)})`);
  }
  say(`\nSpend estimate so far: GBP ${budget.total.toFixed(3)}`);
  if (offenders.length) fail(2, name2, new Error(offenders.join("; ")), ["Fix the prompt (autoTagPrompt) or validator in src/lib/media/vocabulary.ts and re-run."]);
  else pass(2, name2, [`${items.length} items tagged; every raw value is inside the vocabulary`]);

  // Check 3
  const name3 = "Thumbnails and poster frames written beside the originals; the grid serves them, not the originals";
  rule("CHECK 3 " + name3);
  try {
    await reconcileStorageAndRows();
    const { data: rows } = await svc.from("photo_inventory").select("id, kind, storage_path, thumb_path, poster_path").eq("company_id", state.companyId);
    const problems = []; const lines = [];
    for (const r of rows || []) {
      const preview = r.kind === "video" ? r.poster_path : r.thumb_path;
      if (!preview) { problems.push(`${r.id} (${r.kind}) has no ${r.kind === "video" ? "poster" : "thumbnail"}`); continue; }
      const folder = r.kind === "video" ? "posters" : "thumbs";
      if (!preview.startsWith(`${state.companyId}/${folder}/`)) problems.push(`${r.id}: ${preview} is not under ${folder}/`);
      const slash = preview.lastIndexOf("/");
      const { data: l } = await svc.storage.from("captures").list(preview.slice(0, slash), { search: preview.slice(slash + 1), limit: 5 });
      const hit = l?.find((e) => e.name === preview.slice(slash + 1));
      if (!hit) problems.push(`${r.id}: ${preview} is not in storage`);
      lines.push(`${r.kind} ${r.id}: original ${r.storage_path} | preview ${preview} (${hit?.metadata?.size ?? "?"} bytes)`);
    }
    await signIn();
    const grid = must(await http("GET", `/api/bank?companyId=${state.companyId}`), "grid");
    const sharp = (await import("sharp")).default;
    for (const it of grid.data.data) {
      const keys = Object.keys(it);
      if (keys.includes("view_url") || keys.includes("storage_path")) problems.push(`grid item ${it.id} exposes ${keys.filter((k) => k === "view_url" || k === "storage_path").join(", ")}`);
      if (!it.thumb_url) { problems.push(`grid item ${it.id} has no thumb_url`); continue; }
      const origin = (rows || []).find((r) => r.id === it.id)?.storage_path;
      const urlPath = decodeURIComponent(new URL(it.thumb_url).pathname);
      if (origin && urlPath.includes(origin)) problems.push(`grid item ${it.id} serves the ORIGINAL`);
      if (!/\/(thumbs|posters)\//.test(urlPath)) problems.push(`grid item ${it.id} thumb_url is not a thumbs or posters key`);
      const img = await fetch(it.thumb_url, { signal: AbortSignal.timeout(60_000) });
      const b = Buffer.from(await img.arrayBuffer()); const m = await sharp(b).metadata();
      lines.push(`grid ${it.id}: ${b.length} bytes, ${m.width}x${m.height}`);
      if (Math.max(m.width, m.height) > 400) problems.push(`grid item ${it.id} image is ${m.width}x${m.height}, over 400`);
    }
    for (const l of lines) say("  " + l);
    if (problems.length) fail(3, name3, new Error(problems.join("; ")));
    else pass(3, name3, [`${grid.data.data.length} grid items, every one a thumbnail or poster of 400 px or less, none exposing an original`]);
  } catch (e) { fail(3, name3, e); }
}

const BRIEFS = {
  special_of_the_day: "Pan-fried sea bass, crushed new potatoes, lemon butter, 22 pounds, until it runs out.",
  whats_on_this_week: "Wednesday live acoustic music from 7. Friday fish and chips for 12 pounds. Sunday roast served 12 until 5, book ahead on the phone.",
  live_scene: "Terrace is full, a few tables left inside by the fire, kitchen open until 9.",
  event: "Wine tasting, Friday 14 November, 7pm, 35 pounds a head, book by phone.",
};

async function check4() {
  const name = "Post writing for the five hospitality types (four here, the weather post in check 6)";
  rule("CHECK 4 " + name);
  await signIn();
  const problems = [];
  for (const [slug, brief] of Object.entries(BRIEFS)) {
    if (!budget.add("write", 1.5, UNIT.write)) { problems.push("spend ceiling reached"); break; }
    const r = await http("POST", "/api/hospitality/quick", { json: { companyId: state.companyId, postTypeSlug: slug, brief }, timeoutMs: 180_000 });
    if (!r.ok) { problems.push(`${slug}: HTTP ${r.status} ${redact(r.data?.error || "")}`); continue; }
    record("pieceIds", r.data.pieceId);
    captions[slug] = r.data.body;
    // The app supplies today's date to the writer alongside the brief, so the
    // day, month and year of today and tomorrow are figures it may use.
    const dateWords = [0, 1].map((d) => new Date(Date.now() + d * 86_400_000).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" })).join(" ");
    const a = assessCaption(r.data.body, { allowEmoji: false, brief: `${brief} ${dateWords}` });
    say(`\n  ${slug}\n  brief: ${brief}\n  ----\n${r.data.body.split("\n").map((l) => "  | " + l).join("\n")}\n  ----`);
    say(`  warnings from the app: ${JSON.stringify(r.data.warnings)} | photo: ${r.data.imageUrls?.length ? "attached" : (r.data.imageNote || "none")}`);
    say(`  house rules: ${a.pass ? "pass" : "FAIL: " + a.problems.join("; ")}${a.unsupportedFigures.length ? ` | figures not in the brief: ${a.unsupportedFigures.join(", ")}` : ""}`);
    if (!a.pass) problems.push(`${slug}: ${a.problems.join("; ")}`);
    if (a.unsupportedFigures.length) problems.push(`${slug}: figures not in the brief: ${a.unsupportedFigures.join(", ")}`);
    const { data: piece } = await svc.from("content_pieces").select("approval_status, post_type, auto_source").eq("id", r.data.pieceId).maybeSingle();
    if (piece?.approval_status !== "pending") problems.push(`${slug}: draft is ${piece?.approval_status}, expected pending`);
  }
  await reconcileStorageAndRows();
  if (problems.length) fail(4, name, new Error(problems.join("; ")));
  else pass(4, name, ["four captions pass the house rules; the weather caption is checked in check 6"]);
}

const TRANSCRIPT = [
  "Right, so this is what is happening next week. Wednesday we have live acoustic music from seven o'clock, it is free, no booking needed, and the terrace heaters will be on.",
  "Thursday is our wine tasting evening, seven thirty, thirty five pounds a head, six wines with nibbles, and you do need to book by phone.",
  "On Friday the kitchen is doing fish and chips for twelve pounds, cod or haddock, served until nine.",
  "Saturday I want to show off the new autumn menu. The pumpkin and sage risotto is the one I am proudest of, fourteen pounds, and it is vegetarian.",
  "On Sunday it is the roast, served from twelve until five, beef or lamb, eighteen pounds, and please book ahead because we are always full on a Sunday.",
  "If it is a nice afternoon the garden by the lake is open and we will have the firepits lit from four.",
  "Oh, and Thursday again, a reminder that the wine tasting is the one to book for, because last time we sold out.",
  "That is the week. Let me think if there is anything else. No, I think that is everything for now. Thank you.",
].join(" ");

async function check5() {
  const name = "Weekly planner from a two-minute dictation";
  rule("CHECK 5 " + name);
  await signIn();
  let form = null; let mode = "typed transcript";
  // LIVE_CHECK_TYPED=1 sends the typed transcript instead of synthesised speech,
  // for when no transcription provider is reachable (Gemini quota spent, no
  // valid OpenAI key). The planner is then checked; transcription is not.
  if (!process.env.LIVE_CHECK_TYPED && which("say") && which("ffmpeg")) {
    const aiff = path.join(os.tmpdir(), `live-check-dictation-${Date.now()}.aiff`);
    const webm = aiff.replace(/\.aiff$/, ".webm");
    record("localFiles", aiff); record("localFiles", webm);
    const s = spawnSync("say", ["-o", aiff, TRANSCRIPT]);
    const f = s.status === 0 ? spawnSync("ffmpeg", ["-v", "error", "-i", aiff, "-ac", "1", "-c:a", "libopus", "-b:a", "32k", "-y", webm]) : { status: 1 };
    if (s.status === 0 && f.status === 0 && fs.existsSync(webm)) {
      const secs = ffprobeInfo(webm).duration;
      form = new FormData();
      form.set("companyId", state.companyId); form.set("week", "next");
      form.set("audio", new Blob([fs.readFileSync(webm)], { type: "audio/webm" }), "week.webm");
      mode = `synthesised speech, ${secs ? secs.toFixed(0) : "?"} s, ${fs.statSync(webm).size} bytes (transcription exercised)`;
      budget.add("transcribe", 1, UNIT.transcribe);
    }
  }
  say("Input:", mode);
  if (!budget.add("plan", 1.5, UNIT.plan) || !budget.add("write", 7, UNIT.write)) throw new Error("Spend ceiling reached before the planner");
  const r = form
    ? await http("POST", "/api/hospitality/week-plan", { form, timeoutMs: 300_000 })
    : await http("POST", "/api/hospitality/week-plan", { json: { companyId: state.companyId, week: "next", transcript: TRANSCRIPT }, timeoutMs: 300_000 });
  must(r, "week plan");
  for (const c of r.data.created) record("pieceIds", c.pieceId);
  await reconcileStorageAndRows();
  say("What the transcription heard:", r.data.transcript);
  say("Notes from the planner:", r.data.notes);

  const { data: pieces } = await svc.from("content_pieces").select("id, post_type, scheduled_date, scheduled_time, approval_status, auto_source, markdown_body, week_id, title").eq("company_id", state.companyId).eq("auto_source", "weekly_interview").order("scheduled_date").order("scheduled_time");
  const ids = (pieces || []).map((p) => p.id);
  const { data: imgs } = await svc.from("content_images").select("content_piece_id, filename").in("content_piece_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  say("\nThe week as planned:");
  for (const p of pieces || []) {
    const n = (imgs || []).filter((i) => i.content_piece_id === p.id).length;
    say(`  ${p.scheduled_date} ${String(p.scheduled_time).slice(0, 5)} | ${p.post_type} | ${p.approval_status} | ${n} photo(s)\n     ${p.markdown_body.split("\n")[0]}`);
  }
  const weekIds = [...new Set((pieces || []).map((p) => p.week_id))];
  weekIds.forEach((w) => record("weekIds", w));

  // Does it land on the calendar?
  const dates = (pieces || []).map((p) => p.scheduled_date).sort();
  let onCalendar = 0;
  if (dates.length) {
    const cal = must(await http("GET", `/api/calendar?companyId=${state.companyId}&start=${dates[0]}&end=${dates[dates.length - 1]}`), "calendar");
    onCalendar = cal.data.pieces.filter((p) => ids.includes(p.id)).length;
    say(`Calendar API returned ${onCalendar} of the ${ids.length} planned posts.`);
  }
  const problems = [];
  if (ids.length < 5 || ids.length > 7) problems.push(`${ids.length} posts planned, expected 5 to 7 (the dictation has at least six distinct things)`);
  if ((pieces || []).some((p) => p.approval_status !== "pending")) problems.push("a planned post is not pending");
  if (onCalendar !== ids.length) problems.push(`only ${onCalendar} of ${ids.length} appear on the calendar`);
  if (!(pieces || []).every((p) => (imgs || []).some((i) => i.content_piece_id === p.id))) problems.push("some posts have no suggested photo");
  if (problems.length) fail(5, name, new Error(problems.join("; ")), [`input: ${mode}`]);
  else pass(5, name, [`${ids.length} posts, all pending, all on the calendar, all with a suggested library photo`, `input: ${mode}`]);
}

async function check6() {
  const name = "Weather cron for GL7 5TH, day-ahead mode";
  rule("CHECK 6 " + name);
  await signIn();
  const pc = must(await http("GET", "/api/company/postcode?postcode=" + encodeURIComponent("GL7 5TH")), "postcode lookup");
  say("Postcode lookup:", pc.data);
  must(await http("PUT", "/api/company/hospitality", { json: { companyId: state.companyId, postcode: pc.data.postcode, latitude: pc.data.latitude, longitude: pc.data.longitude, timezone: "Europe/London", weather_post_enabled: true, weather_post_time: "07:00", weather_post_for: "tomorrow" } }), "weather settings");
  if (!budget.add("write", 1.5, UNIT.write)) throw new Error("Spend ceiling reached before the cron");

  // Scoped to the scratch company so no other company can be touched.
  const run = await http("GET", `/api/cron/weather-posts?companyId=${state.companyId}`, { auth: false, headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, timeoutMs: 300_000 });
  must(run, "cron");
  say("Cron answered:", run.data);
  const outcome = run.data.results?.[0];
  const { data: runRow } = await svc.from("weather_post_runs").select("*").eq("company_id", state.companyId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (runRow) record("weatherRunIds", runRow.id);
  await reconcileStorageAndRows();
  const problems = [];
  if (outcome?.status !== "drafted") problems.push(`cron outcome was ${JSON.stringify(outcome)}`);
  const { data: piece } = outcome?.pieceId ? await svc.from("content_pieces").select("*").eq("id", outcome.pieceId).maybeSingle() : { data: null };
  if (piece) {
    const { data: imgs } = await svc.from("content_images").select("filename").eq("content_piece_id", piece.id);
    say("\nWeather draft:", { id: piece.id, scheduled_date: piece.scheduled_date, scheduled_time: piece.scheduled_time, approval_status: piece.approval_status, auto_source: piece.auto_source });
    say("Forecast used:", piece.source_meta?.forecast);
    say("Wanted weather tags, best first:", piece.source_meta?.weather_tags, "| facts given to the writer:", piece.source_meta?.facts);
    const chosen = piece.source_meta?.image_ids || [];
    const { data: chosenRows } = chosen.length ? await svc.from("photo_inventory").select("id, original_filename, tags, people_present").in("id", chosen) : { data: [] };
    say("Chosen library images:"); for (const c of chosenRows || []) say(`  ${c.original_filename} | tags ${JSON.stringify(c.tags)} | people_present ${c.people_present}`);
    say(`Images attached to the draft: ${(imgs || []).length}`);
    say("Caption:\n" + piece.markdown_body.split("\n").map((l) => "  | " + l).join("\n"));
    captions.weather_of_the_day = piece.markdown_body;
    const wanted = piece.source_meta?.weather_tags || [];
    const matching = (chosenRows || []).filter((c) => (c.tags || []).some((t) => t.startsWith("weather:") && wanted.includes(t.slice(8))));
    say(`Images whose weather tag matches the forecast: ${matching.length} of ${(chosenRows || []).length}${matching.length === 0 ? " (the scratch library may simply have none: check the tags above)" : ""}`);
    const a = assessCaption(piece.markdown_body, { allowEmoji: false, brief: piece.source_meta?.facts || "" });
    say(`  house rules: ${a.pass ? "pass" : "FAIL: " + a.problems.join("; ")}${a.unsupportedFigures.length ? ` | figures not in the forecast: ${a.unsupportedFigures.join(", ")}` : ""}`);
    if (!a.pass) problems.push(`weather caption: ${a.problems.join("; ")}`);
    if (piece.approval_status !== "pending") problems.push(`draft is ${piece.approval_status}, expected pending`);
    if ((imgs || []).length === 0) problems.push("no image attached to the draft");
    if ((chosenRows || []).some((c) => c.people_present === true)) problems.push("a chosen image has a person in it");
    const approvals = await http("GET", "/approvals");
    const html = approvals.text;
    say(`/approvals page: HTTP ${approvals.status}, lists the weather draft: ${html.includes("Weather of the day") || html.includes(piece.title)}`);
    if (!(html.includes("Weather of the day") || html.includes(piece.title))) problems.push("the draft does not appear on /approvals");
    // Second call must not draft again.
    const second = await http("GET", `/api/cron/weather-posts?companyId=${state.companyId}`, { auth: false, headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, timeoutMs: 120_000 });
    say("Second cron call:", second.data?.results);
    if (second.data?.results?.[0]?.status !== "exists") problems.push("a second cron call did not report 'exists'");
    // Export of the week, drafts included, for the CSV path.
    const wk = must(await http("GET", `/api/export/metricool?weekId=${piece.week_id}&draft=true`), "export");
    fs.writeFileSync(EXPORT_FILE, wk.text);
    say(`Metricool CSV (draft) written to ${EXPORT_FILE}: ${wk.text.split("\r\n").length - 1} post row(s); export notes: ${wk.headers.get("x-export-notes") ? decodeURIComponent(wk.headers.get("x-export-notes")) : "none"}`);
  }
  if (problems.length) fail(6, name, new Error(problems.join("; ")));
  else pass(6, name, ["draft landed pending on /approvals with images attached; a second call did not duplicate it"]);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdPreflight() {
  const file = await loadEnv();
  say(`Env file: ${file} (exists: ${fs.existsSync(file)})`);
  const missing = envProblems();
  say(missing.length ? `Missing variables (names only): ${missing.join(" | ")}` : "All required variable names are set.");
  say("Optional, set:", ["RESEND_API_KEY (will be blanked for the test server)", "OPENAI_API_KEY"].map((n) => `${n.split(" ")[0]}=${process.env[n.split(" ")[0]] ? "set" : "not set"}`).join(", "));
  for (const t of ["ffmpeg", "ffprobe", "say", "npx", "node"]) say(`  ${t}: ${which(t) ? "on PATH" : "NOT on PATH"}`);
  const dl = path.join(os.homedir(), "Downloads");
  const all = [...walkFiles(dl), ...walkFiles(path.join(ROOT, "public"), { maxDepth: 3 })];
  const photos = process.env.LIVE_CHECK_PHOTOS ? process.env.LIVE_CHECK_PHOTOS.split(":") : choosePhotos(all).map((f) => f.file);
  say("Photos that would be uploaded and sent to the tagging models (read this list before running):"); photos.forEach((p) => say("  -", p));
  say("Short video that would be used:", process.env.LIVE_CHECK_CLIP || chooseClip(all)?.file || "none: a synthetic clip");
  say("Big clip:", which("ffmpeg") ? `ffmpeg synthetic, padded to ${process.env.LIVE_CHECK_VIDEO_BYTES || 1_000_000_000} bytes` : "largest video under ~/Downloads");
  say(`Spend ceiling GBP ${budget.limit}. Estimated total for a full run: about GBP 0.30.`);
  say(existsState() ? "State file exists: a previous run left records. Run cleanup before run." : "No state file: clean start.");
  if (missing.length) process.exitCode = 1;
}
const existsState = () => !!loadState()?.companyId;

async function cmdRun() {
  await loadEnv();
  const missing = envProblems();
  if (missing.length) { say(`Missing variables (names only): ${missing.join(" | ")}`); process.exit(2); }
  if (existsState()) { say("A state file from a previous run exists. Run cleanup first."); process.exit(2); }
  state = emptyState(); saveState();
  rule("SETUP");
  svc = await serviceClient();
  try {
    await checkMigrations();
    say("Migrations 039, 040 and 041 are present.");
    await createScratch();
    await startDev();
  } catch (e) {
    say(`SETUP FAILED: ${redact(e.message)}`);
    stopDev();
    say("Anything created so far is in the state file. Run cleanup.");
    process.exit(1);
  }
  let c1ok = false;
  try { await check1(); c1ok = true; } catch (e) { fail(1, "Resumable upload", e); }
  try { await check2and3(); } catch (e) { fail(2, "Auto-tagging", e); skip(3, "Thumbnails and posters", "check 2 did not complete, so its uploads may be missing"); }
  void c1ok;
  try { await check4(); } catch (e) { fail(4, "Post writing", e); }
  try { await check5(); } catch (e) { fail(5, "Weekly planner", e); }
  try { await check6(); } catch (e) { fail(6, "Weather cron", e); }
  try { await reconcileStorageAndRows(); } catch (e) { say(`Reconcile failed: ${redact(e.message)}`); }
  stopDev();

  rule("FIVE CAPTIONS, IN FULL");
  for (const slug of ["weather_of_the_day", "special_of_the_day", "whats_on_this_week", "live_scene", "event"]) {
    say(`\n[${slug}]`); say(captions[slug] ?? "(not produced)");
  }
  rule("SERVER LOG (error lines, redacted)");
  for (const l of devTail.filter((l) => /error|fail|claude|gemini|openai|provider|generateText|transcribe/i.test(l)).slice(-60)) say("  " + l.slice(0, 700));

  rule("SUMMARY");
  for (const r of results) say(`  check ${r.n}: ${r.status} - ${r.name}${r.error ? `\n      ${r.error}` : ""}`);
  say(`\nSpend estimate: GBP ${budget.total.toFixed(2)} of ${budget.limit} (generous per-call estimates)`, budget.lines);
  say(`Metricool CSV: ${fs.existsSync(EXPORT_FILE) ? EXPORT_FILE : "not written"}`);
  say(`Tagger raw replies: ${RAW_LOG}`);
  say(`\nScratch data is still in place. Run:  node scripts/live-check-lakeside.mjs cleanup`);
  process.exitCode = results.some((r) => r.status === "FAIL") ? 1 : 0;
}

async function cmdCleanup() {
  await loadEnv();
  const missing = envProblems().filter((m) => !m.startsWith("one of"));
  if (missing.length) { say(`Missing variables (names only): ${missing.join(" | ")}`); process.exit(2); }
  if (!loadState()) { say("No state file: nothing to clean."); return; }
  state = loadState();
  svc = await serviceClient();
  rule("CLEANUP");
  // Pick up anything the app created for the scratch company since the last record, by company id.
  try { await reconcileStorageAndRows(); } catch (e) { say(`Reconcile: ${redact(e.message)}`); }

  const deleted = []; const remained = [];
  const delRows = async (table, ids) => {
    if (!ids.length) return;
    const { error } = await svc.from(table).delete().in("id", ids);
    if (error) { say(`  ${table}: delete failed: ${redact(error.message)}`); }
    const { data } = await svc.from(table).select("id").in("id", ids);
    const left = (data || []).map((r) => r.id);
    deleted.push(`${table}: ${ids.length - left.length} of ${ids.length}`);
    for (const id of left) remained.push(`${table} ${id}`);
  };
  const delObjects = async (bucket, keys) => {
    if (!keys.length) return;
    for (let i = 0; i < keys.length; i += 50) {
      const { error } = await svc.storage.from(bucket).remove(keys.slice(i, i + 50));
      if (error) say(`  ${bucket}: remove failed: ${redact(error.message)}`);
    }
    let left = 0;
    for (const k of keys) {
      const slash = k.lastIndexOf("/");
      const { data } = await svc.storage.from(bucket).list(k.slice(0, slash), { search: k.slice(slash + 1), limit: 5 });
      if (data?.some((e) => e.name === k.slice(slash + 1))) { left += 1; remained.push(`${bucket}/${k}`); }
    }
    deleted.push(`${bucket} objects: ${keys.length - left} of ${keys.length}`);
  };

  await delObjects("captures", state.storage.captures);
  await delObjects("content-assets", state.storage["content-assets"]);
  await delRows("notifications", state.notificationIds);
  await delRows("weather_post_runs", state.weatherRunIds);
  await delRows("content_pieces", state.pieceIds); // content_images and assets go with their pieces
  await delRows("weeks", state.weekIds);
  await delRows("photo_inventory", state.inventoryIds);
  if (state.userId) {
    await delRows("users", [state.userId]);
    const { error } = await svc.auth.admin.deleteUser(state.userId);
    if (error) say(`  auth user: delete failed: ${redact(error.message)}`);
    const { data } = await svc.auth.admin.getUserById(state.userId);
    if (data?.user) remained.push(`auth user ${state.userId}`); else deleted.push("auth user: 1 of 1");
  }
  if (state.companyId) await delRows("companies", [state.companyId]);
  for (const f of state.localFiles) { try { fs.unlinkSync(f); } catch { /* already gone */ } }
  for (const f of [RAW_LOG, EXPORT_FILE]) { try { fs.unlinkSync(f); } catch { /* none */ } }

  say("\nDeleted:"); deleted.forEach((d) => say("  " + d));
  if (remained.length) {
    say("\nREMAINED (not deleted, left in the state file for another attempt):"); remained.forEach((r) => say("  " + r));
    process.exitCode = 1;
  } else {
    say("\nNothing remained. Scratch company, user, rows and storage objects are gone.");
    fs.unlinkSync(STATE_FILE);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2];
  const run = cmd === "preflight" ? cmdPreflight : cmd === "run" ? cmdRun : cmd === "cleanup" ? cmdCleanup : null;
  if (!run) { console.log("Usage: node scripts/live-check-lakeside.mjs preflight | run | cleanup"); process.exit(2); }
  run().catch((e) => { console.error(redact(`Unexpected failure: ${e?.stack || e}`)); stopDev(); process.exit(1); });
}
