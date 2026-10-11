import { toLinkedInText } from "@/lib/linkedin/post-text";
import { ContentError } from "./auth";
import { checked,db,principal,weekRecord,sessionRecord } from "./store";
import { stableJSON } from "./json";
import { approvedPlan } from "./workflow";
import { approvedSnapshot,type PieceSnapshot } from "./review";
import { promoteMedia } from "./media";

// Existing 88-column schema, including video URLs in Picture Url columns as
// documented by Metricool. Destination groups have separate import contexts.
export const METRICOOL_HEADERS=["Text","Date","Time","Draft","Facebook","Twitter/X","LinkedIn","GBP","Instagram","Pinterest","TikTok","Youtube","Threads","Bluesky",
 ...Array.from({length:10},(_,i)=>`Picture Url ${i+1}`),...Array.from({length:10},(_,i)=>`Alt text picture ${i+1}`),
 "Document title","Shortener","Video Thumbnail Url","Video Cover Frame","Twitter/X Can reply","Twitter/X Type","Twitter/X Poll Duration minutes",...Array.from({length:4},(_,i)=>`Twitter/X Poll Option ${i+1}`),
 "Pinterest Board","Pinterest Pin Title","Pinterest Pin Link","Pinterest Pin New Format","Instagram Post Type","Instagram Show Reel On Feed","Youtube Video Title","Youtube Video Type","Youtube Video Privacy","Youtube video for kids","Youtube Video Category","Youtube Video Tags","Youtube playlist","GBP Post Type","Facebook Post Type","Facebook Title","First Comment Text","TikTok Title","TikTok disable comments","TikTok disable duet","TikTok disable stitch","TikTok Post Privacy","TikTok Branded Content","TikTok Your Brand","TikTok Auto Add Music","TikTok Photo Cover Index","TikTok musicId","TikTok title","TikTok author","TikTok startMillis","TikTok durationMillis","TikTok startVideoMillis","LinkedIn Type","LinkedIn Poll Question",...Array.from({length:4},(_,i)=>`LinkedIn Poll Option ${i+1}`),"LinkedIn Poll Duration","LinkedIn Show link preview","LinkedIn Images as Carousel","Threads Reply Control","Brand name"];
export function csvCell(s:string) {return `"${s.replace(/\r\n/g,"\n").replace(/\n/g,"\r\n").replace(/"/g,'""')}"`;}
export function metricoolEligible(s:PieceSnapshot) {
 return ["linkedin_personal","linkedin_company","facebook"].includes(String(s.metadata.destination)) && ["social_post","meme","video","video_script","pdf_guide"].includes(s.content_type);
}
export function metricoolRow(s:PieceSnapshot,urls:string[]):string[] {
 if(!metricoolEligible(s))throw new ContentError("Articles, blogs and newsletter issues need their own approved destination handoff.",422);
 if(!s.scheduled_date || !s.scheduled_time || !/^\d{2}:\d{2}(:\d{2})?$/.test(s.scheduled_time)) throw new ContentError("Every export item needs an explicit date and time.",409);
 const destination=String(s.metadata.destination);
 if(!["linkedin_personal","linkedin_company","facebook"].includes(destination)) throw new ContentError("This item needs a separate destination handoff.",422);
 if(s.media.some(m=>m.kind==="video") && (s.media.length!==1 || urls.length!==1)) throw new ContentError("Export a video with one final video asset.",409);
 if(s.media.some(m=>m.kind==="document") && (s.media.length!==1 || urls.length!==1))throw new ContentError("Export a document with one final PDF asset and no mixed media.",409);
 if(s.media.length>10) throw new ContentError("The CSV supports up to ten media URLs per post.",409);
 const row=new Array(METRICOOL_HEADERS.length).fill("");row[0]=toLinkedInText(s.markdown_body);row[1]=s.scheduled_date;row[2]=s.scheduled_time.length===5?`${s.scheduled_time}:00`:s.scheduled_time;
 row[3]="true"; // Import as reviewed drafts; Michael confirms the destination schedule.
 for(let i=4;i<14;i++) row[i]="false";
 row[destination==="facebook"?4:6]="true";
 urls.forEach((url,i)=>{row[14+i]=url;row[24+i]=s.media[i]?.filename || s.title;});
 if(s.media.some(m=>m.kind==="document")) {if(destination==="facebook") throw new ContentError("Facebook document posts require a manual handoff.",422);row[34]=s.title.slice(0,58);}
 if(destination==="facebook") {row[59]="POST";row[60]=s.title;}
 row[61]=s.first_comment?toLinkedInText(s.first_comment):"";row[77]="POST";row[84]=s.media.length?"false":"true";row[85]=s.metadata.images_as_carousel===true?"true":"false";
 // Brand names stay blank unless the exact configured name is verified by the operator.
 row[87]="";return row;
}
export async function exportReadiness(weekId:string) {
 const w=await weekRecord(weekId),session=await sessionRecord(weekId),d=await db();approvedPlan(session);
 const pieces=checked(await d.from("content_pieces").select("id,title,approval_status,ops_content_metadata").eq("week_id",weekId).eq("company_id",principal().companyId));
 const snapshots:PieceSnapshot[]=[],blockers:{pieceId:string;title:string;reason:string}[]=[];
 const selected=new Set(session.plan_json?.slots.map(s=>s.id));
 const current=(pieces||[]).filter(p=>p.ops_content_metadata?.workflow_id===session.id && Number(p.ops_content_metadata?.workflow_revision)===session.revision && selected.has(p.ops_content_metadata?.slot_id));
 for(const slot of session.plan_json?.slots || []) if(!current.some(p=>p.ops_content_metadata.slot_id===slot.id)) blockers.push({pieceId:slot.id,title:slot.title || slot.id,reason:"This approved plan slot has no imported draft. Complete or recover production first."});
 for(const p of current) try {
  const snapshot=await approvedSnapshot(p.id),slot=session.plan_json!.slots.find(s=>s.id===p.ops_content_metadata.slot_id)!;
  for(const field of ["feed","destination","lane","asset_family","template_version","cta_asset_id","cta_url","source_ids","required_media"] as const)if(slot[field]!==undefined && stableJSON(snapshot.metadata[field] ?? null)!==stableJSON(slot[field] ?? null))throw new ContentError("The reviewed routing or source selection differs from its approved plan slot. Revise and approve the plan first.",409);
  if(slot.scheduled_date && (snapshot.scheduled_date!==slot.scheduled_date || snapshot.scheduled_time?.slice(0,5)!==slot.scheduled_time.slice(0,5)))throw new ContentError("The reviewed date or time differs from its approved plan slot.",409);
  snapshots.push(snapshot);
 } catch(e) {blockers.push({pieceId:p.id,title:p.title,reason:e instanceof ContentError?e.message:"Approval could not be checked."});}
 for(const s of snapshots) if(metricoolEligible(s)) try{metricoolRow(s,s.media.map(()=>"https://preview.invalid/approved"));}catch(e){blockers.push({pieceId:s.piece_id,title:s.title,reason:e instanceof Error?e.message:"Export is blocked."});}
 return {ready:!!snapshots.length && !blockers.length,week:w,revision:session.revision,workflowId:session.id,approvedPlan:session.approved_snapshot,blockers,snapshots,excluded:(pieces||[]).filter(p=>!current.includes(p)).map(p=>({pieceId:p.id,title:p.title,reason:"Outside this approved plan revision."})),manualHandoffs:snapshots.filter(s=>!metricoolEligible(s)).map(s=>({pieceId:s.piece_id,title:s.title,destination:s.metadata.destination,approvedSnapshot:s,reason:"Requires its own approved destination handoff. No send or publish is performed."}))};
}
export async function exportWeek(weekId:string) {
 const readiness=await exportReadiness(weekId);
 if(!readiness.ready) throw new ContentError("Resolve the review and scheduling blockers before exporting this week.",409);
 const groups=new Map<string,{destination:string;feed:string;rows:string[][]}>();
 for(const s of readiness.snapshots) {
  const destination=String(s.metadata.destination);if(!metricoolEligible(s)) continue;
  const urls=await Promise.all(s.media.map(m=>promoteMedia(m,s.piece_id,s.revision)));
  // Re-read the hash after promotion. A concurrent edit must not enter the export.
  if((await approvedSnapshot(s.piece_id)).hash!==s.hash) throw new ContentError("A reviewed item changed during export. Reload it.",409);
  const key=`${s.metadata.feed}-${destination}`;if(!groups.has(key))groups.set(key,{destination,feed:String(s.metadata.feed),rows:[]});groups.get(key)!.rows.push(metricoolRow(s,urls));
 }
 const files=[...groups.values()].map(g=>({filename:`content-${readiness.week.date_start}-${g.feed}-${g.destination}.csv`,destination:g.destination,feed:g.feed,importContext:`Import into the correct ${g.feed} ${g.destination} brand context, then review and confirm scheduling.`,csv:[METRICOOL_HEADERS,...g.rows].map(row=>row.map(csvCell).join(",")).join("\r\n")}));
 const d=await db();checked(await d.rpc("ops_content_record_export",{p_workflow:readiness.workflowId,p_company:principal().companyId,p_revision:readiness.revision,p_plan:readiness.approvedPlan,p_snapshots:readiness.snapshots.map(s=>({piece_id:s.piece_id,revision:s.revision,hash:s.hash}))}));
 return {status:"exported",files,manualHandoffs:readiness.manualHandoffs,scheduled:false};
}
