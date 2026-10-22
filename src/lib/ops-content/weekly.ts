import { verifyPlanSources } from "./source-checks";
import { weeklyPayload } from "./payload";
import { stableJSON } from "./json";
import { generateText } from "@/lib/providers/content-generation/generate-text";
import { BRAND_CONTEXT_COPY,CURRENT_CONTENT_OVERRIDES } from "./brand-context";
import { ContentError } from "./auth";
import { ASSET_TEMPLATE,CTA_ASSETS,MAIN_MAGNETS } from "./catalog";
import { checked,db,principal,rpcRow,sessionRecord,updateSession,weekRecord } from "./store";
import { ledger,sourceContext } from "./media";
import { approvedPlan,parseAnswers,parseSources,requireRevision,safeJob,validatePlan,type WeeklySession,type ContentSource } from "./workflow";

const invalidApproval={approved_at:null,approved_by:null,approved_snapshot:null};
export async function saveInterview(weekId:string,body:Record<string,unknown>) {
 const s=await sessionRecord(weekId);requireRevision(body,s);
 const sources=body.sources!==undefined?parseSources(body.sources):s.source_inventory;
 const verifiedSources=await sourceContext(sources);
 return {session:await updateSession(s,{answers:body.answers!==undefined?parseAnswers(body.answers):s.answers,source_inventory:verifiedSources,plan_status:"interview",plan_revision:null,...invalidApproval})};
}
export async function interviewTurn(weekId:string,body:Record<string,unknown>) {
 const s=await sessionRecord(weekId),week=await weekRecord(weekId);requireRevision(body,s);
 if(typeof body.message!=="string" || !body.message.trim() || body.message.length>10000) throw new ContentError("Write a message under 10,000 characters.");
 const now=new Date().toISOString();const user={id:crypto.randomUUID(),role:"user" as const,content:body.message.trim(),created_at:now};
 // Persist the answer before contacting the model. A failed follow-up never loses it.
 if(body.occurredAt!==undefined && body.occurredAt!==null && body.occurredAt!=="" && typeof body.occurredAt!=="string")throw new ContentError("Supply a valid event date.");
 const occurredAt=typeof body.occurredAt==="string" && body.occurredAt?body.occurredAt:null;
 const source={id:user.id,type:"current_story" as const,kind:"interview",title:user.content.slice(0,100),evidence:user.content,text:user.content,supplied_by_user:true,occurred_at:occurredAt};
 const verifiedSource=parseSources([source])[0];
 const saved=await updateSession(s,{source_inventory:[...s.source_inventory,verifiedSource],messages:[...s.messages,user],plan_status:"interview",plan_revision:null,...invalidApproval});
 const d=await db();const company=checked(await d.from("companies").select("name,spokesperson_name").eq("id",principal().companyId).single());
 const voice=checked(await d.from("company_voice_profiles").select("voice_description,structured_voice").eq("company_id",principal().companyId).eq("is_active",true).order("created_at",{ascending:false}).limit(1).maybeSingle());
 let result;
 try {result=await generateText({maxTokens:700,systemPrompt:`${BRAND_CONTEXT_COPY}\n${CURRENT_CONTENT_OVERRIDES}\nYou are Markey interviewing Michael for the selected week. Ask one concise follow-up grounded in his actual answers and source inventory. Establish what happened, its date, usable photos/finished videos and why it matters. Use the supplied dates for events from the week just finished or the current selected week. Do not date an earlier event as happening in the upcoming publication week. Consider current sources first, then optional podcast, skit, newsletter, NHS trust, Snake Oil and assessment lanes. All three main magnets must be considered when planning. Do not create a plan or invent facts, client permission, rights, imagery or dates. No em dashes, no emojis, British English. Return only a conversational follow-up. Company voice context: ${JSON.stringify({company,voice})}`,userPrompt:JSON.stringify({week:{date_start:week.date_start,date_end:week.date_end},messages:saved.messages,source_inventory:saved.source_inventory})});}
 catch {return {session:saved,followUp:null,warning:"Your answer is saved. Markey's follow-up is unavailable. Retry the follow-up when the model is connected."};}
 const reply={id:crypto.randomUUID(),role:"assistant" as const,content:result.text.replace(/\u2014/g,", "),created_at:new Date().toISOString()};
 return {session:await updateSession(saved,{messages:[...saved.messages,reply]}),followUp:reply.content};
}
export async function savePlan(weekId:string,body:Record<string,unknown>) {
 const s=await sessionRecord(weekId),w=await weekRecord(weekId);requireRevision(body,s);
 const markdown=body.planMarkdown ?? body.plan_markdown;
 if(typeof markdown!=="string" || !markdown.trim() || markdown.length>100000) throw new ContentError("Save the complete plan text.");
 const plan=validatePlan(body.planJSON ?? body.plan_json,s.source_inventory,w);
 return {session:await updateSession(s,{plan_markdown:markdown,plan_json:plan,plan_revision:s.revision+1,plan_status:"draft",...invalidApproval})};
}
async function mediaSnapshot(sources:ContentSource[]) {
 const chosen=[...new Set(sources.map(s=>s.media_id).filter(Boolean))] as string[];
 return Promise.all(chosen.map(async mediaId=>{const m=await ledger(mediaId),source=sources.find(s=>s.media_id===mediaId)!;return {id:m.id,company_id:m.company_id,bucket:m.bucket,storage_path:m.storage_path,kind:m.kind,role:m.role,version:m.version,filename:m.filename,mime_type:m.mime_type,size_bytes:m.size_bytes,has_burned_captions:m.has_burned_captions,rights:source.rights || m.rights || null,finished:m.role==="final"};}));
}
async function snapshot(s:WeeklySession,w:Record<string,unknown>) {
 const sources=await sourceContext(s.source_inventory);
 const media=await mediaSnapshot(sources);
 return {workflow_id:s.id,revision:s.revision,markdown:s.plan_markdown,plan_json:s.plan_json,source_inventory:sources,media,
 dates:{date_start:w.date_start,date_end:w.date_end},date_start:w.date_start,date_end:w.date_end,legacy_week_label:s.legacy_week_label,year:Number(String(w.date_start).slice(0,4)),week:w.week_number,
 selected_lanes:s.plan_json?.selected_lanes,approved_at:new Date().toISOString(),approved_by:principal().id,
 asset_template:ASSET_TEMPLATE,cta_assets:CTA_ASSETS};
}
export async function approvePlan(weekId:string,body:Record<string,unknown>) {
 const s=await sessionRecord(weekId),w=await weekRecord(weekId);requireRevision(body,s);
 if(s.plan_revision!==s.revision || !s.plan_markdown?.trim()) throw new ContentError("Save the current plan before approving.",409);
 const plan=validatePlan(s.plan_json,s.source_inventory,w);await verifyPlanSources(s);const approved=await snapshot({...s,plan_json:plan},w);
 return {session:await updateSession(s,{plan_json:plan,plan_status:"approved",approved_snapshot:approved,approved_at:approved.approved_at,approved_by:approved.approved_by},false)};
}
export async function queueWeek(weekId:string,body:Record<string,unknown>,type:"ops_weekly_plan"|"ops_weekly_production") {
 if(process.env.CONTENT_WEEKLY_WORKER_ENABLED!=="true")throw new ContentError("The weekly worker is awaiting activation. Your saved interview and plan remain available.",503);
 const s=await sessionRecord(weekId),w=await weekRecord(weekId);requireRevision(body,s);
 const sources=await sourceContext(s.source_inventory);
 if(!sources.length && !s.messages.some(x=>x.role==="user") && !Object.values(s.answers).some(Boolean)) throw new ContentError("Save the available sources or interview answers first.");
 const approved=type==="ops_weekly_production"?approvedPlan(s):undefined;
 if(approved) validatePlan(s.plan_json,sources,w);
 const freshMedia=await mediaSnapshot(sources),media=approved?(approved.media as Record<string,unknown>[]):freshMedia;
 if(approved && (stableJSON(approved.source_inventory)!==stableJSON(sources) || stableJSON(media)!==stableJSON(freshMedia)))throw new ContentError("Source media or declarations changed after plan approval. Save and approve the plan again.",409);
 const p=principal(),payload=weeklyPayload({...s,source_inventory:sources},w,p,media,body.operationKey,approved);
 const d=await db();const j=rpcRow(await d.rpc("ops_content_queue_week",{p_id:s.id,p_company:p.companyId,p_revision:s.revision,p_type:type,p_payload:payload,p_actor:p.id}));
 return {job:safeJob(j as Record<string,unknown>),jobId:(j as {id:string}).id,session:await sessionRecord(weekId)};
}
