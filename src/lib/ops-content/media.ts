import { stableJSON } from "./json";
import { POST as signUpload } from "@/app/api/upload/sign/route";
import { sanitiseFilename } from "@/lib/upload/media-constants";
import { ContentError } from "./auth";
import { checked,db,id,pieceRecord,principal,sessionRecord,updateSession,weekRecord } from "./store";
import type { ContentSource } from "./workflow";

export interface ReviewMedia { id:string;kind:"image"|"video"|"document";role:"source"|"final";version:string;bucket?:string;storage_path?:string;url?:string;preview_url?:string;filename:string;week_id?:string|null;content_piece_id?:string|null;mime_type?:string;source_context?:string|null;rights?:{allowed:true;source:string}|null; }
export function ownedPath(path:unknown,companyId:string):string {
 if(typeof path!=="string" || !path.startsWith(`${companyId}/`) || path.includes("..") || path.includes("\\")) throw new ContentError("That media does not belong to this content account.",403);
 return path;
}
export async function signMedia(body:Record<string,unknown>) {
 const p=principal(),d=await db();let out;
 if(body.kind==="document") {
  if(body.mimeType!=="application/pdf" || typeof body.filename!=="string" || !body.filename.trim() || !Number.isInteger(body.sizeBytes) || Number(body.sizeBytes)<=0 || Number(body.sizeBytes)>50*1024*1024) throw new ContentError("Upload a PDF under 50 MB.");
  const path=`${p.companyId}/documents/${crypto.randomUUID()}-${sanitiseFilename(body.filename)}`;
  const signed=checked(await d.storage.from("content-drafts").createSignedUploadUrl(path));
  if(!signed)throw new ContentError("Upload signing failed.",503);
  out={bucket:"content-drafts",path,token:signed.token,signedUrl:signed.signedUrl};
 } else {
  const response=await signUpload(new Request("https://content.internal/upload",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...body,companyId:p.companyId})}));
  out=await response.json();if(!response.ok)throw new ContentError("This media type or size cannot be uploaded.",response.status);
 }
 const row=checked(await d.from("ops_content_media").insert({company_id:p.companyId,bucket:out.bucket,storage_path:out.path,kind:body.kind,version:crypto.randomUUID(),filename:body.filename,mime_type:String(body.mimeType).split(";")[0].trim().toLowerCase(),size_bytes:body.sizeBytes,created_by:p.id}).select("id,version").single());
 if(!row)throw new ContentError("Upload registration failed.",503);
 return {...out,mediaId:row.id,version:row.version};
}
export async function ledger(mediaId:string) {
 const d=await db(); const m=checked(await d.from("ops_content_media").select("*").eq("id",id(mediaId)).eq("company_id",principal().companyId).eq("registered",true).maybeSingle());
 if(!m) throw new ContentError("Uploaded media not found.",404);return m;
}
export async function signedMedia(m:ReviewMedia):Promise<ReviewMedia> {
 if(m.url) return {...m,preview_url:m.url};
 if(!m.bucket || !m.storage_path || !["captures","content-drafts"].includes(m.bucket)) throw new ContentError("Media preview is unavailable.",409);
 ownedPath(m.storage_path,principal().companyId);
 const d=await db();const data=checked(await d.storage.from(m.bucket).createSignedUrl(m.storage_path,3600)); if(!data)throw new ContentError("Preview signing failed.",503); return {...m,preview_url:data.signedUrl};
}
export function fromLedger(m:Record<string,unknown>):ReviewMedia {
 return {id:String(m.id),kind:m.kind==="photo"?"image":m.kind as "video"|"document",role:m.role as "source"|"final",version:String(m.version),bucket:String(m.bucket),storage_path:String(m.storage_path),filename:String(m.filename),week_id:m.week_id as string|null,content_piece_id:m.content_piece_id as string|null,mime_type:String(m.mime_type),source_context:m.source_context as string|null,rights:m.rights as ReviewMedia["rights"]};
}
export async function registerMedia(body:Record<string,unknown>) {
 const p=principal(),d=await db(),path=ownedPath(body.path,p.companyId);
 const m=checked(await d.from("ops_content_media").select("*").eq("company_id",p.companyId).eq("bucket",body.bucket).eq("storage_path",path).maybeSingle());
 if(!m) throw new ContentError("Sign this upload before registering it.",404);
 if(m.kind!==body.kind || Number(m.size_bytes)!==Number(body.sizeBytes) || m.mime_type!==String(body.mimeType).split(";")[0].trim().toLowerCase()) throw new ContentError("Upload details differ from the signed request.",409);
 const slash=path.lastIndexOf("/");const objects=checked(await d.storage.from(m.bucket).list(path.slice(0,slash),{search:path.slice(slash+1),limit:100}));
 const object=objects?.find(o=>o.name===path.slice(slash+1));
 if(!object || Number(object.metadata?.size)!==Number(m.size_bytes) || object.metadata?.mimetype!==m.mime_type) throw new ContentError("The upload is incomplete or its stored size/type differs.",409);
 const rights=body.rights as {allowed?:unknown;source?:unknown}|undefined;
 if(rights && (rights.allowed!==true || typeof rights.source!=="string" || !rights.source.trim() || rights.source.length>2000))throw new ContentError("Record explicit permission and its source for this media.");
 const sourceContext=typeof body.title==="string"?body.title.slice(0,20000):null;
 if(m.registered && (m.source_context || null)!==sourceContext)throw new ContentError("The registered media context is immutable. Edit the weekly source notes instead.",409);
 const role=body.role==="final"?"final":"source";
 if(m.kind==="video" && role==="final" && body.finished!==true) throw new ContentError("Declare that this is a finished edited video before assigning it as final.");
 if(m.registered && (m.role!==role || m.has_burned_captions!==(body.has_burned_captions===true) || stableJSON(m.rights || null)!==stableJSON(rights || null))) throw new ContentError("Upload a new version to change its declared purpose or captions.",409);
 checked(await d.from("ops_content_media").update({registered:true,role,source_context:typeof body.title==="string"?body.title.slice(0,20000):null,has_burned_captions:body.has_burned_captions===true,rights:rights || null}).eq("id",m.id));
 m.source_context=typeof body.title==="string"?body.title.slice(0,20000):null;m.role=role;m.rights=rights || null;m.has_burned_captions=body.has_burned_captions===true;
 if(body.weekId || body.pieceId) return assignMedia({...body,mediaId:m.id});
 return {media:await signedMedia(fromLedger({...m,registered:true}))};
}
export async function assignMedia(body:Record<string,unknown>) {
 const d=await db(),m=await ledger(id(body.mediaId));
 if(body.weekId && body.pieceId)throw new ContentError("Assign to a week or a post separately, using that record's revision.");
 if(body.weekId) {
  const s=await sessionRecord(id(body.weekId));if(body.revision!==s.revision) throw new ContentError("This week changed. Reload it.",409);
  const source:ContentSource={id:m.id,type:m.kind==="document"?"asset":m.kind,title:m.source_context || m.filename,media_id:m.id,bucket:m.bucket,storage_path:m.storage_path,version:m.version,role:m.role,rights:m.rights || undefined,has_burned_captions:m.has_burned_captions,supplied_by_user:true,kind:"uploaded_media",text:m.source_context || `Uploaded ${m.kind}: ${m.filename}. No event details or claims are inferred from the filename.`};
  const sources=[...s.source_inventory.filter(s=>s.id!==m.id),source];
  await updateSession(s,{source_inventory:sources,plan_status:"interview",plan_revision:null,approved_at:null,approved_by:null,approved_snapshot:null});
  checked(await d.from("ops_content_media").update({week_id:body.weekId}).eq("id",m.id));
 }
 if(body.pieceId) {
  const piece=await pieceRecord(id(body.pieceId));
  const review=checked(await d.from("ops_content_reviews").select("revision").eq("content_piece_id",piece.id).single());
  if(!review)throw new ContentError("Save this post before attaching media.",409);
  if(body.revision!==review.revision) throw new ContentError("This post changed. Reload it.",409);
  // Final video is an explicit declaration captured at registration, never a filename heuristic.
  checked(await d.rpc("ops_content_attach_media",{p_piece:piece.id,p_company:principal().companyId,p_revision:review.revision,p_media:m.id}));
 }
 if(!body.weekId && !body.pieceId) throw new ContentError("Assign media to a week or post.");
 const assigned=await ledger(m.id); return {media:await signedMedia(fromLedger(assigned)),session:body.weekId?await sessionRecord(String(body.weekId)):undefined};
}
export async function sourceContext(sources:ContentSource[]) {
 return Promise.all(sources.map(async s=>{if(!s.media_id)return s;const m=await ledger(s.media_id);if(m.version!==s.version)throw new ContentError("A source media version changed. Select it again.",409);return {...s,bucket:m.bucket,storage_path:m.storage_path,role:m.role,version:m.version,has_burned_captions:m.has_burned_captions===true};}));
}
export async function mediaForPiece(piece:Record<string,unknown>):Promise<ReviewMedia[]> {
 const d=await db();const [a,i]=await Promise.all([
 d.from("content_assets").select("*").eq("content_piece_id",piece.id).order("sort_order"),
 d.from("content_images").select("*").eq("content_piece_id",piece.id).order("sort_order")]);
 const assets=checked(a),images=checked(i);const media:ReviewMedia[]=[];
 for(const asset of [...(assets || [])].sort((a,b)=>Number(a.asset_metadata?.position ?? a.sort_order ?? 0)-Number(b.asset_metadata?.position ?? b.sort_order ?? 0))) {
  const meta=asset.asset_metadata || {};const kind=meta.type==="raw_video"||meta.type==="rendered_video"?"video":asset.asset_type==="pdf_file"?"document":(meta.type==="selected_photo" || ["image","featured_image","social_share_image","cover_image","header_image","in_article_image"].includes(asset.asset_type))?"image":null;
  if(!kind) continue;
  const path=asset.storage_path || meta.storage_path; const bucket=meta.bucket;
  if(!asset.file_url && (!path||!bucket)) continue;
  media.push({id:asset.id,kind,role:meta.type==="raw_video" || meta.role==="source"?"source":"final",version:meta.version || `${asset.id}:${path || asset.file_url}`,bucket,storage_path:path,url:asset.file_url || undefined,filename:asset.text_content || String(piece.title || "")});
 }
 for(const img of images || []) if(img.public_url) media.push({id:img.id,kind:"image",role:"final",version:`${img.id}:${img.public_url}`,url:img.public_url,filename:img.filename});
 if(!media.some(m=>m.role==="final") && typeof piece.cover_image_url==="string") media.push({id:"cover",kind:"image",role:"final",version:piece.cover_image_url,url:piece.cover_image_url,filename:String(piece.title||"")});
 return media;
}
export async function promoteMedia(m:ReviewMedia,pieceId:string,revision:number):Promise<string> {
 if(m.url) return m.url;
 if(!m.bucket||!m.storage_path) throw new ContentError("An approved media file is unavailable.",409);
 ownedPath(m.storage_path,principal().companyId);
 const path=`ops-approved/${principal().companyId}/${pieceId}/${revision}/${m.id}-${m.storage_path.split("/").pop()}`;
 const d=await db();const result=await d.storage.from(m.bucket).copy(m.storage_path,path,{destinationBucket:"content-assets"});
 if(result.error && !/already exists|Duplicate/i.test(result.error.message)) throw new ContentError("The approved media could not be prepared for export.",503);
 return d.storage.from("content-assets").getPublicUrl(path).data.publicUrl;
}
