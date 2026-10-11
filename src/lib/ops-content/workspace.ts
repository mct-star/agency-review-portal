import { POST as quickGenerate } from "@/app/api/generate/quick/route";
import { standaloneWeekId } from "@/lib/calendar/schedule";
import { POST_TYPES,getPostType } from "@/lib/constants/post-types";
import { resolveProvider } from "@/lib/providers";
import { ContentError } from "./auth";
import { ASSET_TEMPLATE,CTA_ASSETS,FILLER_LANES,MAIN_MAGNETS } from "./catalog";
import { checked,db,id,jobRecord,principal,sessionRecord,weekRecord } from "./store";
import { assignMedia,fromLedger,ledger,signedMedia } from "./media";
import { detailPiece,validateMetadata } from "./review";
import { INTERVIEW_QUESTIONS,safeJob } from "./workflow";
import { queueWeek } from "./weekly";

export async function workspace() {
 const p=principal(),d=await db();const company=checked(await d.from("companies").select("id,name,spokesperson_name").eq("id",p.companyId).single());
 if(!company)throw new ContentError("Content company is unavailable.",503);
 const config=await resolveProvider(p.companyId,"content_generation");
 const modelAvailable=!!(config?.provider==="anthropic_claude" && config.credentials.api_key || process.env.ANTHROPIC_API_KEY);
 const [weekList,pieceList]=await Promise.all([listWeeks(),listPieces()]);
 return {...weekList,...pieceList,company,author:company.spokesperson_name,model:p.model,modelLabel:p.modelLabel,modelAvailable,questions:INTERVIEW_QUESTIONS,ctaAssets:CTA_ASSETS,fillerLanes:FILLER_LANES,mainMagnets:MAIN_MAGNETS,assetTemplate:ASSET_TEMPLATE,
  postTypes:POST_TYPES.map(({slug,label,description,medium,production,contentType})=>({slug,label,description,medium,production,contentType})),
  capabilities:{singlePost:true,weekly:true,interview:true,uploads:true,transcription:true,review:true,metricoolExport:true,directRelease:process.env.CONTENT_DIRECT_RELEASE_ENABLED==="true",automaticScheduling:false,videoUpload:true,podcastCuts:"requires-approved-source-and-timings",newsletterSend:false,websitePublish:false,workerRequired:true,worker:{online:process.env.CONTENT_WEEKLY_WORKER_ENABLED==="true",reason:process.env.CONTENT_WEEKLY_WORKER_ENABLED==="true"?"Operator enabled the weekly worker. Job heartbeats show actual run progress.":"Weekly worker awaiting activation."},releaseReason:"Direct release needs a publisher that checks the current approval immediately before publishing."}};
}
export async function listWeeks() {
 const d=await db(),company=principal().companyId;
 const weeks=checked(await d.from("weeks").select("id,week_number,year,date_start,date_end,title,status").eq("company_id",company).neq("week_number",0).order("date_start",{ascending:false}).limit(52));
 const sessions=checked(await d.from("ops_content_workflows").select("week_id,legacy_week_label,plan_status,revision,last_job_id").eq("company_id",company));
 return {weeks:(weeks||[]).map(w=>({...w,legacy_week_label:sessions?.find(s=>s.week_id===w.id)?.legacy_week_label || null,session:sessions?.find(s=>s.week_id===w.id) || null}))};
}
export async function listPieces(weekId?:string) {
 const d=await db();let query=d.from("content_pieces").select("id,week_id,title,content_type,post_type,markdown_body,first_comment,scheduled_date,scheduled_time,approval_status,ops_content_metadata,created_at,updated_at").eq("company_id",principal().companyId);
 if(weekId){await weekRecord(weekId);query=query.eq("week_id",weekId);}
 const pieces=checked(await query.order("created_at",{ascending:false}).limit(100));
 const reviews=pieces?.length?checked(await d.from("ops_content_reviews").select("content_piece_id,revision,approved_revision,watched_revision,exported_at,release_job_id").in("content_piece_id",(pieces||[]).map(p=>p.id))):[];
 return {pieces:(pieces||[]).map(p=>({...p,metadata:p.ops_content_metadata,review:reviews?.find(r=>r.content_piece_id===p.id) || {revision:0,approved_revision:null}}))};
}
export async function weekDetail(weekId:string) {
 const week=await weekRecord(weekId),session=await sessionRecord(weekId),d=await db();const summaries=await listPieces(weekId);
 const pieces={pieces:await Promise.all(summaries.pieces.map(async p=>(await detailPiece(p.id)).piece))};
 const records=checked(await d.from("ops_content_media").select("*").eq("company_id",principal().companyId).eq("week_id",weekId).eq("registered",true));
 const media=await Promise.all((records||[]).map(m=>signedMedia(fromLedger(m))));
 const weeklyJobs=checked(await d.from("content_generation_jobs").select("*").eq("company_id",principal().companyId).eq("week_id",weekId).in("job_type",["ops_weekly_plan","ops_weekly_production"]).order("created_at",{ascending:false}).limit(20)) || [];
 const releaseJobs=pieces.pieces.length?checked(await d.from("content_generation_jobs").select("*").eq("company_id",principal().companyId).in("content_piece_id",pieces.pieces.map(p=>p.id)).eq("job_type","ops_linkedin_publish").order("created_at",{ascending:false}).limit(20)) || []:[];
 const jobs=[...weeklyJobs,...releaseJobs];
 return {week:{...week,legacy_week_label:session.legacy_week_label},session:{...session,source_inventory:session.source_inventory.map(s=>({...s,preview_url:media.find(m=>m.id===s.media_id)?.preview_url}))},...pieces,media,jobs:(jobs||[]).map(safeJob)};
}
export async function generatePost(body:Record<string,unknown>) {
 if(typeof body.topic!=="string" || !body.topic.trim() || body.topic.length>10000)throw new ContentError("Supply a topic under 10,000 characters.");
 const type=getPostType(String(body.postTypeSlug));if(!type)throw new ContentError("Choose a supported post type.");
 if(type.production!=="portal")throw new ContentError("Use the weekly workflow for this production format, or upload its finished asset.",422);
 const mediaIds=body.mediaIds ?? [];if(!Array.isArray(mediaIds) || mediaIds.length>10)throw new ContentError("Choose up to ten owned media files.");
 const selected=await Promise.all(mediaIds.map(m=>ledger(id(m))));
 const allowedMetadata=Object.fromEntries(Object.entries((body.metadata||{}) as Record<string,unknown>).filter(([key])=>["feed","destination","cta_asset_id","cta_url","asset_family","template_version","required_media"].includes(key)));
 const metadata=validateMetadata({feed:"personal",destination:"linkedin_personal",...allowedMetadata,managed:"ops",operation_key:body.operationKey,post_type:type.slug});
 const response=await quickGenerate(new Request("https://content.internal/generate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyId:principal().companyId,topic:body.topic,postTypeSlug:type.slug,platform:"linkedin",sourceContext:selected.map(m=>({filename:m.filename,kind:m.kind,role:m.role,text:m.source_context || null})),ctaUrl:metadata.cta_url || null})}));
 if(!response.ok)throw new ContentError("Markey could not generate this draft. Check the model connection and retry with a new action.",response.status);
 const output=await response.json();if(typeof output.postText!=="string" || !output.postText.trim())throw new ContentError("No draft copy was returned.",503);
 const d=await db(),week=await standaloneWeekId(d,principal().companyId);
 const piece=checked(await d.from("content_pieces").insert({company_id:principal().companyId,week_id:week,content_type:type.contentType,title:body.topic.slice(0,200),markdown_body:output.postText.replace(/[\u2013\u2014]/g,", "),first_comment:output.firstComment,post_type:type.dbSlug,word_count:output.postText.trim().split(/\s+/).length,approval_status:"pending",ops_content_metadata:metadata}).select("id").single());
 if(!piece)throw new ContentError("The draft could not be saved.",503);
 for(const media of selected){const current=await detailPiece(piece.id);await assignMedia({pieceId:piece.id,mediaId:media.id,revision:current.piece.review.revision});}
 return {...await detailPiece(piece.id),pieceId:piece.id,warnings:output.warnings};
}
export async function retryJob(jobId:string,body:Record<string,unknown>) {
 const job=await jobRecord(jobId);if(job.status!=="failed" || !["ops_weekly_plan","ops_weekly_production"].includes(job.job_type))throw new ContentError("Only failed native weekly jobs can be retried. A running job needs worker recovery.",409);
 const session=await sessionRecord(job.week_id);if(session.id!==job.input_payload?.workflow_id || session.revision!==job.input_payload?.workflow_revision)throw new ContentError("This job belongs to an older plan revision. Start from the current plan.",409);
 return queueWeek(job.week_id,{...body,revision:session.revision},job.job_type);
}
