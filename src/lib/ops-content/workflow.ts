import { stableJSON } from "./json";
import { getPostType,POST_TYPES,type PostTypeMedium } from "@/lib/constants/post-types";
import { ContentError } from "./auth";
import { ASSET_TEMPLATE, CTA_ASSETS, FILLER_LANES, MAIN_MAGNETS } from "./catalog";

export const INTERVIEW_QUESTIONS = [
  { id: "what_happened", label: "Any interesting conversations or observations this week worth capturing?" },
  { id: "what_surprised", label: "Anything time-sensitive this week? Launches, deadlines, events you're attending?" },
  { id: "what_to_say", label: "Anything you've been thinking about but haven't posted? A contrarian view, a pattern you keep seeing?" },
  { id: "steer", label: "Anything else you want this week's content to reflect?" },
] as const;

export interface InterviewMessage { id?: string; role: "user" | "assistant"; content: string; created_at: string; }
export interface WeeklySession {
  id: string; company_id: string; week_id: string; revision: number;
  answers: Record<string, string>; messages: InterviewMessage[];
  plan_markdown: string | null; plan_revision: number | null;
  plan_status: "interview" | "draft" | "approved";
  approved_at: string | null; approved_by: string | null; last_job_id: string | null;
  model: string; model_label: string;
  source_inventory: ContentSource[]; plan_json: WeeklyPlan | null;
  approved_snapshot: Record<string, unknown> | null; legacy_week_label: string | null;
}

export interface ContentSource {
  id: string; type: "current_story" | "photo" | "video" | "podcast" | "skit" | "newsletter" | "asset";
  title: string; evidence?: string; occurred_at?: string | null; url?: string | null;
  media_id?: string; bucket?: string; storage_path?: string; version?: string;
  role?: "source" | "final"; last_used_at?: string | null; authorisation?: string;
  rights?:{allowed:true;source:string};
  kind?: string; text?: string; supplied_by_user?: boolean;
  word_timings?: {word:string;start:number;end:number}[]; has_burned_captions?:boolean;
}
export interface PlanSlot {
  id: string; lane: string; feed: "personal" | "company";
  scheduled_date: string; scheduled_time: string; post_type: string;
  source_ids: string[]; media_ids: string[]; asset_family?: string | null; template_version?: string | null;
  destination: string; cta_asset_id?: string | null; cta_url?: string | null;
  why: string; last_used_at?: string | null; title?: string; content_type?: string;
  assessment_focus?:"broad"|"focused";
  required_media?: "none" | "image" | "video" | "pdf";
  medium?:PostTypeMedium;
  clip?: {media_id:string;source_id:string;start_seconds:number;end_seconds:number;caption_mode:"burn"|"source";formats:("16x9"|"9x16")[]};
}
export interface WeeklyPlan { strategy: "CURRENT_FIRST"; considered_magnets: string[]; magnet_decisions:{magnet:string;decision:"include"|"hold";why:string}[]; selected_lanes: string[]; slots: PlanSlot[]; }
export const DESTINATIONS = ["linkedin_personal", "linkedin_company", "facebook", "website", "newsletter", "manual"];

export function dateWeek(dateStart: unknown) {
  if (typeof dateStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStart)) throw new ContentError("Choose the Monday date for this week.");
  const monday = new Date(`${dateStart}T00:00:00Z`);
  if (!Number.isFinite(monday.getTime()) || monday.toISOString().slice(0,10) !== dateStart || monday.getUTCDay() !== 1) throw new ContentError("Choose a valid Monday date.");
  const thursday = new Date(monday.getTime() + 3 * 86400000);
  const year = thursday.getUTCFullYear();
  const start = new Date(Date.UTC(year,0,4));
  start.setUTCDate(start.getUTCDate() + 1 - (start.getUTCDay() || 7));
  const week_number = Math.round((monday.getTime()-start.getTime()) / (7*86400000))+1;
  return { year,week_number,...isoWeekDates(year,week_number) };
}

export function legacyContentWeek(dateStart:string) {
 const monday=new Date(`${dateStart}T00:00:00Z`),first=new Date(Date.UTC(monday.getUTCFullYear(),0,1));
 first.setUTCDate(1+(8-first.getUTCDay())%7);
 return Math.floor((monday.getTime()-first.getTime())/(7*86400000))+1;
}

export function parseSources(value: unknown): ContentSource[] {
  if (!Array.isArray(value) || value.length > 150) throw new ContentError("Choose up to 150 sources.");
  const seen = new Set<string>();
  return value.map(raw => {
    if (!raw || typeof raw !== "object") throw new ContentError("Each source must be a record.");
    const s = raw as ContentSource;
    if (typeof s.id !== "string" || !s.id || seen.has(s.id) || typeof s.title !== "string" || !s.title.trim() || !["current_story","photo","video","podcast","skit","newsletter","asset"].includes(s.type)) throw new ContentError("Each source needs a unique ID, type and title.");
    seen.add(s.id);
    if (s.evidence && (typeof s.evidence !== "string" || s.evidence.length > 20000)) throw new ContentError("Source evidence is too long.");
    if(s.rights && (s.rights.allowed!==true || typeof s.rights.source!=="string" || !s.rights.source.trim()))throw new ContentError("Source permission must be an explicit declaration with provenance.");
    if(s.occurred_at && (typeof s.occurred_at!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(s.occurred_at.slice(0,10)) || !Number.isFinite(new Date(`${s.occurred_at.slice(0,10)}T00:00:00Z`).getTime()) || new Date(`${s.occurred_at.slice(0,10)}T00:00:00Z`).toISOString().slice(0,10)!==s.occurred_at.slice(0,10)))throw new ContentError("Supply a valid event date.");
    if (s.url && !/^https:\/\//.test(s.url)) throw new ContentError("Source links must use HTTPS.");
    if(s.kind==="interview")return s;
    if(!s.url && !s.media_id)return {...s,kind:s.kind || "note",supplied_by_user:true,text:s.text || s.evidence || s.title,evidence:s.evidence || s.text || s.title};
    return s;
  });
}

export function validatePlan(raw: unknown, sources: ContentSource[], week: { date_start: string; date_end: string }): WeeklyPlan {
  let p = raw as WeeklyPlan;
  if (!p || p.strategy !== "CURRENT_FIRST" || !Array.isArray(p.slots) || !p.slots.length || p.slots.length > 40 || !Array.isArray(p.considered_magnets) || !MAIN_MAGNETS.every(id => p.considered_magnets.includes(id))) throw new ContentError("The plan must consider all three main magnets and use current sources first.");
  p={...p,slots:p.slots.map(slot=>({...slot}))};
  if(!Array.isArray(p.magnet_decisions) || p.magnet_decisions.length!==3 || !MAIN_MAGNETS.every(id=>p.magnet_decisions.filter(d=>d.magnet===id && ["include","hold"].includes(d.decision) && typeof d.why==="string" && d.why.trim()).length===1)) throw new ContentError("Record an include or hold decision and reason for each main magnet.");
  const sourceMap = new Map(sources.map(s => [s.id,s])); const seen = new Set<string>();const bookings=new Set<string>();
  for (const s of p.slots) {
    if (!s.id || seen.has(s.id) || !["personal","company"].includes(s.feed) || !DESTINATIONS.includes(s.destination) || typeof s.why !== "string" || !s.why.trim() || !Array.isArray(s.source_ids) || !s.source_ids.length || !Array.isArray(s.media_ids)) throw new ContentError("Each slot needs a unique ID, sources, feed, destination and reason.");
    seen.add(s.id);
    if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(s.id) || typeof s.post_type!=="string" || !s.post_type.trim())throw new ContentError("Each slot needs a safe stable ID and post type.");
    const postType=getPostType(s.post_type) || POST_TYPES.find(type=>type.dbSlug===s.post_type);
    const headerTemplate=["snake-oil","nhs-trust"].includes(s.lane);
    if(postType){
     if(headerTemplate && ["carousel","video"].includes(postType.medium))throw new ContentError("The approved header template needs an image post type, not a carousel or video.");
     s.medium=postType.medium;s.content_type=postType.contentType;
     s.required_media=postType.medium==="carousel"?"pdf":postType.medium==="video"?"video":postType.medium==="image"?"image":"none";
     if(postType.medium==="carousel") {s.asset_family="carousel";s.template_version=null;}
     else if(!headerTemplate && s.asset_family==="carousel") {s.asset_family=null;s.template_version=null;}
    }
    if(headerTemplate){
     if(["carousel","video"].includes(s.medium || "") || ["pdf","video"].includes(s.required_media || "") || ["pdf_guide","video","video_script"].includes(s.content_type || ""))throw new ContentError("The approved header template needs an image post type, not a carousel or video.");
     if(s.medium!==undefined)s.medium="image";s.required_media="image";
    }
    const booking=[s.feed,s.destination,s.scheduled_date,s.scheduled_time].join("|");if(bookings.has(booking))throw new ContentError("Two slots collide on the same destination and time.");bookings.add(booking);
    if (s.scheduled_date < week.date_start || s.scheduled_date > week.date_end || !/^\d{2}:\d{2}$/.test(s.scheduled_time) || Number(s.scheduled_time.slice(0,2))>23 || Number(s.scheduled_time.slice(3,5))>59) throw new ContentError("Every slot needs a date within this week and an explicit time.");
    if(s.feed==="personal" && s.destination==="linkedin_company" || s.feed==="company" && s.destination==="linkedin_personal") throw new ContentError("Feed and LinkedIn destination differ.");
    if(s.media_ids.some(id=>!sources.some(source=>source.media_id===id))) throw new ContentError("A selected media source is missing from the inventory.");
    if(s.clip) {
      const c=s.clip,source=sourceMap.get(c.source_id);
      if(s.lane!=="podcast" || !source || source.media_id!==c.media_id || !s.source_ids.includes(c.source_id) || !s.media_ids.includes(c.media_id) || !Number.isFinite(c.start_seconds) || !Number.isFinite(c.end_seconds) || c.start_seconds<0 || c.end_seconds<=c.start_seconds || c.end_seconds-c.start_seconds>60 || !Array.isArray(c.formats) || c.formats.length!==1 || c.formats.some(f=>!["16x9","9x16"].includes(f))) throw new ContentError("Podcast cuts need approved source media, exact bounds under 60 seconds and one selected format.");
      if(c.caption_mode==="burn" && (!Array.isArray(source.word_timings) || !source.word_timings.length || source.word_timings.some(w=>typeof w.word!=="string" || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.start<0 || w.end<w.start))) throw new ContentError("Burned captions need actual transcript word timings.");
      if(c.caption_mode==="source" && source.has_burned_captions!==true) throw new ContentError("Confirm the source already has captions.");
      if(!["burn","source"].includes(c.caption_mode)) throw new ContentError("Choose an explicit caption mode.");
    }
    if (!s.source_ids.every(id => sourceMap.has(id))) throw new ContentError("A planned source is missing.");
    if (s.lane === "current_story" && !s.source_ids.some(id => {const source=sourceMap.get(id)!;return source.type === "current_story" && !!source.occurred_at && /^\d{4}-\d{2}-\d{2}$/.test(source.occurred_at.slice(0,10)) && source.occurred_at.slice(0,10)>=new Date(new Date(`${week.date_start}T00:00:00Z`).getTime()-7*86400000).toISOString().slice(0,10) && source.occurred_at.slice(0,10)<=s.scheduled_date;})) throw new ContentError("Stories need a supplied recent source date, no later than their publication date.");
    if(s.lane==="podcast") {
     const previous=[s.last_used_at,...s.source_ids.map(id=>sourceMap.get(id)?.last_used_at)].filter(Boolean) as string[];
     const cutoff=new Date(new Date(`${s.scheduled_date}T00:00:00Z`).getTime()-42*86400000).toISOString().slice(0,10);
     if(previous.some(date=>!/^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(date) || !Number.isFinite(Date.parse(date)) || date.slice(0,10)>=cutoff))throw new ContentError("A previously used podcast clip needs more than six weeks before reuse. Unknown history must stay explicitly unknown.");
    }
    if (s.lane !== "current_story" && !(FILLER_LANES as readonly string[]).includes(s.lane)) throw new ContentError("Unknown filler lane.");
    if (s.cta_asset_id) {
      const asset = CTA_ASSETS.find(a => a.id === s.cta_asset_id);
      if (!asset || s.cta_url !== asset.url) throw new ContentError("Choose the canonical asset destination.");
    } else if (s.cta_url) throw new ContentError("A CTA URL needs a registered asset.");
    if (["snake-oil","nhs-trust"].includes(s.lane) && (s.asset_family !== ASSET_TEMPLATE.family || s.template_version !== ASSET_TEMPLATE.version)) throw new ContentError("Use the approved 9 October asset template for this lane.");
    if (s.lane === "assessment" && s.assessment_focus === "focused" && (!s.cta_asset_id?.startsWith("assessment-") || s.cta_asset_id === "assessment-hub")) throw new ContentError("Focused assessment posts need a matched diagnostic.");
  }
  for(const decision of p.magnet_decisions) {
   const present=p.slots.some(s=>decision.magnet==="assessment-hub"?(s.lane==="assessment" || !!s.cta_asset_id?.startsWith("assessment-")):(s.lane===decision.magnet || s.cta_asset_id===decision.magnet));
   if((decision.decision==="include")!==present)throw new ContentError("Lead magnet include or hold decisions must match the selected slots.");
  }
  return {...p,selected_lanes:[...new Set(p.slots.map(s=>s.lane))]};
}

export function isoWeekDates(year: unknown, weekNumber: unknown) {
  if (!Number.isInteger(year) || Number(year) < 2020 || Number(year) > 2100 || !Number.isInteger(weekNumber) || Number(weekNumber) < 1 || Number(weekNumber) > 53) {
    throw new ContentError("Choose a valid ISO week and year.");
  }
  const jan4 = new Date(Date.UTC(Number(year), 0, 4));
  const monday = new Date(jan4.getTime() + (1 - (jan4.getUTCDay() || 7) + (Number(weekNumber) - 1) * 7) * 86_400_000);
  const thursday = new Date(monday.getTime() + 3 * 86_400_000);
  if (thursday.getUTCFullYear() !== year) throw new ContentError("That year does not have ISO week 53.");
  return { date_start: monday.toISOString().slice(0, 10), date_end: new Date(monday.getTime() + 6 * 86_400_000).toISOString().slice(0, 10) };
}

export function requireRevision(body: Record<string, unknown>, session: WeeklySession) {
  if (!Number.isInteger(body.revision) || body.revision !== session.revision) throw new ContentError("This week changed. Reload it before saving.", 409);
}

export function parseAnswers(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ContentError("Interview answers are required.");
  const answers: Record<string, string> = {};
  for (const { id } of INTERVIEW_QUESTIONS) {
    const value = (raw as Record<string, unknown>)[id];
    if (value !== undefined && (typeof value !== "string" || value.length > 10_000)) throw new ContentError("Each interview answer must be text under 10,000 characters.");
    answers[id] = typeof value === "string" ? value.trim() : "";
  }
  return answers;
}

export function approvedPlan(session: WeeklySession) {
  if (session.plan_status !== "approved" || session.plan_revision !== session.revision || !session.plan_markdown?.trim() || !session.approved_at || !session.approved_by) {
    throw new ContentError("Approve the current weekly plan before creating content.", 409);
  }
  if (!session.approved_snapshot || session.approved_snapshot.revision!==session.revision || stableJSON(session.approved_snapshot.plan_json)!==stableJSON(session.plan_json)) throw new ContentError("The approved plan snapshot is missing.",409);
  return session.approved_snapshot;
}

export function safeJob(job: Record<string, unknown>) {
  // Local paths, process details and the full interview payload stay server-side.
  const output = job.output_payload as Record<string, unknown> | null;
  return {
    id: job.id, job_type: job.job_type, status: job.status, progress: job.progress,
    error_message: job.error_message, created_at: job.created_at, updated_at: job.updated_at,
    heartbeat_at: job.heartbeat_at,
    output_payload: output ? { summary: output.summary, url: output.url, comment_error:output.comment_error,warnings: output.warnings, content_piece_ids: output.content_piece_ids, expected: output.expected, imported: output.imported, review: output.review, plan_json: output.plan_json, plan_markdown: output.plan_markdown } : null,
  };
}
