import { NextResponse } from "next/server";
import { POST as transcribeVoice } from "@/app/api/generate/transcribe/voice/route";
import { ContentError,verifyContentRequest } from "@/lib/ops-content/auth";
import { withContentPrincipal } from "@/lib/ops-content/principal";
import { createWeek,id,jobRecord } from "@/lib/ops-content/store";
import { safeJob } from "@/lib/ops-content/workflow";
import { detailPiece,savePiece,approvePiece,releasePiece } from "@/lib/ops-content/review";
import { signMedia,registerMedia,assignMedia,ledger,signedMedia,fromLedger } from "@/lib/ops-content/media";
import { saveInterview,interviewTurn,savePlan,approvePlan,queueWeek } from "@/lib/ops-content/weekly";
import { exportReadiness,exportWeek } from "@/lib/ops-content/export";
import { workspace,listWeeks,weekDetail,listPieces,generatePost,retryJob } from "@/lib/ops-content/workspace";
import { operation } from "@/lib/ops-content/operations";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;
const headers={"Cache-Control":"no-store"};
function permitted(method:string,path:string) {
 const routes:Record<string,RegExp>={
 GET:/^(workspace|weeks|weeks\/[a-f0-9-]{36}|weeks\/[a-f0-9-]{36}\/export|pieces|pieces\/[a-f0-9-]{36}|jobs\/[a-f0-9-]{36}|media\/view)$/i,
 POST:/^(weeks|generate|transcribe|media\/(sign|register|assign)|weeks\/[a-f0-9-]{36}\/(interview-turn|plan|approve-plan|run|export)|pieces\/[a-f0-9-]{36}\/(approve|release)|jobs\/[a-f0-9-]{36}\/retry)$/i,
 PUT:/^weeks\/[a-f0-9-]{36}\/(interview|plan)$/i,PATCH:/^pieces\/[a-f0-9-]{36}$/i};return routes[method]?.test(path) || false;
}
async function dispatch(method:string,path:string,body:Record<string,unknown>,url:URL) {
 const parts=path.split("/");
 if(method==="GET") {
  if(path==="workspace")return workspace();
  if(path==="weeks")return listWeeks();
  if(parts[0]==="weeks")return parts[2]==="export"?exportReadiness(id(parts[1])):weekDetail(id(parts[1]));
  if(path==="pieces")return listPieces(url.searchParams.get("weekId") || undefined);
  if(parts[0]==="pieces")return detailPiece(id(parts[1]));
  if(parts[0]==="jobs")return {job:safeJob(await jobRecord(id(parts[1])))};
  if(path==="media/view")return {media:await signedMedia(fromLedger(await ledger(id(url.searchParams.get("id")))))};
 }
 if(path==="weeks")return createWeek(body);
 if(path==="generate")return generatePost(body);
 if(path==="media/sign")return signMedia(body);
 if(path==="media/register")return registerMedia(body);
 if(path==="media/assign")return assignMedia(body);
 if(parts[0]==="weeks") {
  const weekId=id(parts[1]);
  if(parts[2]==="interview")return saveInterview(weekId,body);
  if(parts[2]==="interview-turn")return interviewTurn(weekId,body);
  if(parts[2]==="plan")return method==="PUT"?savePlan(weekId,body):queueWeek(weekId,body,"ops_weekly_plan");
  if(parts[2]==="approve-plan")return approvePlan(weekId,body);
  if(parts[2]==="run")return queueWeek(weekId,body,"ops_weekly_production");
  if(parts[2]==="export")return exportWeek(weekId);
 }
 if(parts[0]==="pieces") {
  const pieceId=id(parts[1]);
  if(method==="PATCH")return savePiece(pieceId,body);
  if(parts[2]==="approve")return approvePiece(pieceId,body);
  if(parts[2]==="release")return releasePiece(pieceId,body);
 }
 if(parts[0]==="jobs" && parts[2]==="retry")return retryJob(id(parts[1]),body);
 throw new ContentError("Content endpoint not found.",404);
}
async function handle(request:Request) {
 try {
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\/ops-content\//,"");
  if(!permitted(request.method,path))throw new ContentError("Content endpoint not found.",404);
  const principal=await verifyContentRequest(request);
  return await withContentPrincipal(principal,async()=>{
   if(path==="transcribe") {
    const form=await request.formData(),audio=form.get("audio");
    if(!(audio instanceof Blob) || audio.size>4*1024*1024 || !["audio/webm","audio/mp4","audio/mpeg","audio/wav","audio/ogg"].includes(audio.type.split(";")[0]))throw new ContentError("Record supported audio under 4 MB.",413);
    const result=await transcribeVoice(new Request("https://content.internal/voice",{method:"POST",body:form}));
    if(!result.ok)throw new ContentError("Voice transcription is unavailable. Your recording has not been saved. Type the answer or retry.",503);
    const output=await result.json();return NextResponse.json({text:output.text,provider:output.provider,duration:output.duration},{headers});
   }
   let body:Record<string,unknown>={};
   if(request.method!=="GET"){try{body=await request.json();}catch{throw new ContentError("Body must be JSON.");}if(!body || Array.isArray(body) || typeof body!=="object")throw new ContentError("Body must be a record.");}
   if(request.method==="GET")return NextResponse.json(await dispatch(request.method,path,body,url),{headers});
   const result=await operation(request.method,url.pathname+url.search,body,()=>dispatch(request.method,path,body,url));
   return NextResponse.json(result.body,{status:result.status,headers});
  });
 } catch(e) {return NextResponse.json({error:e instanceof ContentError?e.message:"Content request failed. Reload to check its saved outcome."},{status:e instanceof ContentError?e.status:503,headers});}
}
export const GET=handle,POST=handle,PUT=handle,PATCH=handle;
