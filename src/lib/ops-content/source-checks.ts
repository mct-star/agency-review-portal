import { createHash } from "node:crypto";
import { ContentError } from "./auth";
import { stableJSON } from "./json";
import type { ContentSource,InterviewMessage,WeeklyPlan,WeeklySession } from "./workflow";
import { checked,db,principal } from "./store";

export function validateSourceChecks(plan:WeeklyPlan,sources:ContentSource[],messages:InterviewMessage[],plannedSources?:ContentSource[]) {
 const checks=(plan as WeeklyPlan & {source_checks?:Record<string,{sha256:string;kind?:string}>}).source_checks;
 for(const id of new Set(plan.slots.flatMap(s=>s.source_ids))) {
  const source=sources.find(s=>s.id===id),check=checks?.[id];
  if(!source || !check || !/^[a-f0-9]{64}$/.test(check.sha256))throw new ContentError("Ask Markey to revise the plan after changing sources. A selected source has no verified evidence hash.",409);
  if(source.url || (source as ContentSource & {path?:string}).path) {
   const before=plannedSources?.find(s=>s.id===id);
   if(!before || stableJSON(before)!==stableJSON(source))throw new ContentError("Ask Markey to revise the plan after changing sources. Its canonical source identity changed.",409);
  } else {
   const text=source.kind==="interview"?messages.filter(m=>m.id===id && m.role==="user").map(m=>m.content).join("\n\n"):source.text || source.evidence;
   if(!text || createHash("sha256").update(text).digest("hex")!==check.sha256)throw new ContentError("Ask Markey to revise the plan after changing sources. Its supplied evidence changed.",409);
  }
 }
}
export async function verifyPlanSources(session:WeeklySession) {
 const d=await db();
 const plans=checked(await d.from("content_generation_jobs").select("input_payload,output_payload").eq("company_id",principal().companyId).eq("week_id",session.week_id).eq("job_type","ops_weekly_plan").eq("status","completed").order("created_at",{ascending:false}).limit(20)) || [];
 const matching=plans.find(j=>j.input_payload?.workflow_id===session.id && stableJSON(j.output_payload?.plan_json?.source_checks)===stableJSON((session.plan_json as WeeklyPlan & {source_checks?:unknown})?.source_checks));
 validateSourceChecks(session.plan_json!,session.source_inventory,session.messages,matching?.input_payload?.source_inventory);
}
