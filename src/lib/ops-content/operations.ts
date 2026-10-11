import { ContentError } from "./auth";
import { checked,db,id,principal } from "./store";
import { detailPiece,snapshotHash } from "./review";

async function recover(d:Awaited<ReturnType<typeof db>>,company:string,key:string) {
 const jobs=checked(await d.from("content_generation_jobs").select("id,status,job_type").eq("company_id",company).contains("input_payload",{operation_key:key}).limit(1));
 if(jobs?.length)return {jobId:jobs[0].id,job:jobs[0],recovered:true};
 const pieces=checked(await d.from("content_pieces").select("id").eq("company_id",company).contains("ops_content_metadata",{operation_key:key}).limit(1));
 if(pieces?.length)return {...await detailPiece(pieces[0].id),pieceId:pieces[0].id,recovered:true,warnings:["The saved draft was recovered. Check its attached media before approval."]};
 return null;
}
export async function operation(method:string,path:string,body:Record<string,unknown>,action:()=>Promise<unknown>):Promise<{body:unknown;status:number}> {
 const operationKey=id(body.operationKey),company=principal().companyId,d=await db(),hash=snapshotHash({method,path,body});
 const claim=await d.from("ops_content_operations").insert({company_id:company,operation_key:operationKey,request_hash:hash});
 if(claim.error) {
  if(claim.error.code!=="23505") checked(claim);
  const previous=checked(await d.from("ops_content_operations").select("*").eq("company_id",company).eq("operation_key",operationKey).single());
  if(previous.request_hash!==hash)throw new ContentError("This operation key belongs to another request. Reload before making a new action.",409);
  if(previous.state==="complete")return {body:previous.response,status:previous.status};
  const recovered=await recover(d,company,operationKey);
  if(recovered)return {body:{...recovered,operationState:"running"},status:200};
  throw new ContentError("This request is still running or its outcome is unknown. Reload the saved workspace before taking another action.",409);
 }
 let result:{body:Record<string,unknown>;status:number};
 try {result={body:await action() as Record<string,unknown>,status:200};}
 catch(e) {
  let recovered=null;
  // Only storage/model failures can have an uncertain committed side effect.
  if(!(e instanceof ContentError) || e.status>=500)try{recovered=await recover(d,company,operationKey);}catch{/* Keep unknown failures fail-closed. */}
  result=recovered?{body:recovered,status:200}:{body:{error:e instanceof ContentError?e.message:"Content request failed. Reload to check its saved outcome."},status:e instanceof ContentError?e.status:503};
 }
 result.body={...result.body,operationState:"complete"};
 // Emit the completed marker only after it is persisted, never after a timeout.
 checked(await d.from("ops_content_operations").update({state:"complete",response:result.body,status:result.status}).eq("company_id",company).eq("operation_key",operationKey).eq("request_hash",hash));
 return result;
}
