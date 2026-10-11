import { DEFAULT_SOURCES } from "./catalog";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ContentError, UUID } from "./auth";
import { contentPrincipal } from "./principal";
import { dateWeek,legacyContentWeek, type WeeklySession } from "./workflow";

export const db = createAdminSupabaseClient;
export function principal() { const p=contentPrincipal(); if(!p) throw new ContentError("Unauthorised content request.",401); return p; }
export function id(value: unknown) { if(typeof value!=="string" || !UUID.test(value)) throw new ContentError("A valid record ID is required."); return value; }
export function checked<T>(result: {data:T;error:{message:string;code?:string}|null}): T {
 if(result.error) {
  const m=result.error.message;
  if(m.includes("RELEASE_LOCKED"))throw new ContentError("This post has a publication intent. Create a new post to change it; reconcile an uncertain publication before another release.",409);
  if(result.error.code==="23505" || /REVISION_CONFLICT|APPROVAL_CONFLICT|WORKFLOW_BUSY|RELEASE_BUSY/.test(m)) throw new ContentError("This item changed or is already running. Reload before retrying.",409);
  if(m.includes("NOT_FOUND")) throw new ContentError("Record not found.",404);
  throw new ContentError("Content storage is unavailable. Your request has not been confirmed.",503);
 }
 return result.data;
}
export function rpcRow<T>(result:{data:T|T[];error:{message:string;code?:string}|null}):T {const value=checked(result);return (Array.isArray(value)?value[0]:value) as T;}
export async function weekRecord(weekId:string) {
 const d=await db(); const w=checked(await d.from("weeks").select("*").eq("id",id(weekId)).eq("company_id",principal().companyId).maybeSingle());
 if(!w) throw new ContentError("Week not found.",404); return w;
}
export async function sessionRecord(weekId:string): Promise<WeeklySession> {
 await weekRecord(weekId); const d=await db();
 const s=checked(await d.from("ops_content_workflows").select("*").eq("week_id",weekId).eq("company_id",principal().companyId).maybeSingle());
 if(!s) throw new ContentError("This week has no native content session. Open it through the week selector first.",404); return s;
}
export async function updateSession(s:WeeklySession,patch:Record<string,unknown>,increment=true) {
 const d=await db(); return rpcRow(await d.rpc("ops_content_update_workflow",{p_id:s.id,p_company:principal().companyId,p_revision:s.revision,p_patch:patch,p_increment:increment})) as WeeklySession;
}
export async function createWeek(body:Record<string,unknown>) {
 const p=principal(),d=await db(),dates=dateWeek(body.dateStart);
 let w=checked(await d.from("weeks").select("*").eq("company_id",p.companyId).eq("date_start",dates.date_start).eq("date_end",dates.date_end).maybeSingle());
 if(!w) w=checked(await d.from("weeks").upsert({...dates,company_id:p.companyId,title:`Week ${dates.week_number}`,status:"draft"},{onConflict:"company_id,week_number,year",ignoreDuplicates:true}).select("*").maybeSingle());
 if(!w) w=checked(await d.from("weeks").select("*").eq("company_id",p.companyId).eq("week_number",dates.week_number).eq("year",dates.year).maybeSingle());
 if(!w || w.date_start!==dates.date_start || w.date_end!==dates.date_end) throw new ContentError("This ISO week conflicts with an existing legacy date range. Resolve its week mapping first.",409);
 const label=typeof body.legacyWeekLabel==="string" && body.legacyWeekLabel.trim() ? body.legacyWeekLabel.trim().slice(0,100) : String(legacyContentWeek(dates.date_start));
 checked(await d.from("ops_content_workflows").upsert({company_id:p.companyId,week_id:w.id,legacy_week_label:label,source_inventory:DEFAULT_SOURCES,model:p.model,model_label:p.modelLabel},{onConflict:"week_id",ignoreDuplicates:true}));
 return {week:w,session:await sessionRecord(w.id)};
}
export async function pieceRecord(pieceId:string) {
 const d=await db(); const piece=checked(await d.from("content_pieces").select("*").eq("id",id(pieceId)).eq("company_id",principal().companyId).maybeSingle());
 if(!piece) throw new ContentError("Post not found.",404); return piece;
}
export async function jobRecord(jobId:string) {
 const d=await db(); const j=checked(await d.from("content_generation_jobs").select("*").eq("id",id(jobId)).eq("company_id",principal().companyId).in("job_type",["ops_weekly_plan","ops_weekly_production","ops_linkedin_publish"]).maybeSingle());
 if(!j) throw new ContentError("Job not found.",404); return j;
}
