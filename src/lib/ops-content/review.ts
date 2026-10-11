import { deliveryState } from "./delivery";
import { mandatoryFormat } from "./formats";
import { safeJob } from "./workflow";
import { stableJSON } from "./json";
import { createHash } from "node:crypto";
import { toLinkedInText,escapeLittleText } from "@/lib/linkedin/post-text";
import { ContentError } from "./auth";
import { CTA_ASSETS } from "./catalog";
import { checked,db,pieceRecord,principal,rpcRow } from "./store";
import { DESTINATIONS } from "./workflow";
import { mediaForPiece,promoteMedia,signedMedia,type ReviewMedia } from "./media";

export interface PieceSnapshot {piece_id:string;revision:number;title:string;content_type:string;markdown_body:string;first_comment:string|null;scheduled_date:string|null;scheduled_time:string|null;metadata:Record<string,unknown>;media:ReviewMedia[];delivery:{commentary:string;first_comment:string|null};hash:string;}
export function snapshotHash(value:unknown) {return createHash("sha256").update(stableJSON(value)).digest("hex");}
export function validateMetadata(raw:unknown):Record<string,unknown> {
 const m=(raw||{}) as Record<string,unknown>;
 if(!["personal","company"].includes(String(m.feed)) || !DESTINATIONS.includes(String(m.destination))) throw new ContentError("Select the feed and destination.");
 if(m.feed==="company" && m.destination==="linkedin_personal" || m.feed==="personal" && m.destination==="linkedin_company") throw new ContentError("The selected feed and LinkedIn destination differ.");
 if(m.cta_asset_id) {const asset=CTA_ASSETS.find(a=>a.id===m.cta_asset_id);if(!asset || asset.url!==m.cta_url) throw new ContentError("Use the registered CTA destination.");}
 else if(m.cta_url) throw new ContentError("Choose a registered CTA asset.");
 return m;
}
export async function detailPiece(pieceId:string) {
 const piece=await pieceRecord(pieceId),d=await db();
 const review=checked(await d.from("ops_content_reviews").select("*").eq("content_piece_id",pieceId).maybeSingle()) || {revision:0,approved_revision:null,watched_revision:null,approved_snapshot:null};
 const media=await mediaForPiece(piece);const previews=await Promise.all(media.map(signedMedia));
 const jobs=checked(await d.from("content_generation_jobs").select("id,job_type,status,error_message,created_at,output_payload").eq("company_id",principal().companyId).eq("content_piece_id",pieceId).order("created_at",{ascending:false}).limit(10));
 const publications=checked(await d.from("publishing_jobs").select("id,status,external_url,publish_payload,response_payload,error_message").eq("company_id",principal().companyId).eq("content_piece_id",pieceId).order("created_at",{ascending:false}).limit(10)) || [];
 const delivery=deliveryState(review,jobs || [],publications);
 const blockers=review.revision===0?["Select a feed and destination, then save to bring this existing post into native review."]:[];
 if(["video","video_script"].includes(piece.content_type) && !media.some(m=>m.role==="final"&&m.kind==="video")) blockers.push("A finished video render is required.");
 if(delivery.requiresReconciliation)blockers.push(delivery.errorMessage || "Publication needs reconciliation before another release.");
 return {piece:{...piece,status:delivery.status,delivery,metadata:piece.ops_content_metadata,review,media:previews,blockers},media:previews,jobs:(jobs||[]).map(safeJob),delivery};
}
export async function makeSnapshot(pieceId:string):Promise<PieceSnapshot> {
 const piece=await pieceRecord(pieceId),d=await db();const review=checked(await d.from("ops_content_reviews").select("*").eq("content_piece_id",pieceId).maybeSingle());
 if(!review) throw new ContentError("Save the post with its feed and destination before native approval.",409);
 const media=(await mediaForPiece(piece)).filter(m=>m.role==="final");
 const value={piece_id:piece.id,revision:review.revision,title:piece.title || "",content_type:piece.content_type,markdown_body:piece.markdown_body || "",first_comment:piece.first_comment,scheduled_date:piece.scheduled_date,scheduled_time:piece.scheduled_time,metadata:validateMetadata(piece.ops_content_metadata),media,delivery:{commentary:escapeLittleText(toLinkedInText(piece.markdown_body || "")),first_comment:piece.first_comment?toLinkedInText(piece.first_comment):null}};
 return {...value,hash:snapshotHash(value)};
}
export async function savePiece(pieceId:string,body:Record<string,unknown>) {
 const piece=await pieceRecord(pieceId),patch:Record<string,unknown>={};
 for(const [input,field] of [["markdownBody","markdown_body"],["firstComment","first_comment"],["title","title"],["scheduledDate","scheduled_date"],["scheduledTime","scheduled_time"]]) if(body[input]!==undefined) {if(body[input]!==null && typeof body[input]!=="string") throw new ContentError("Post edits must be text.");patch[field]=body[input];}
 if(typeof patch.markdown_body==="string" && (!patch.markdown_body.trim()||patch.markdown_body.length>100000)) throw new ContentError("Post copy is required and must fit within 100,000 characters.");
 const incoming=(body.metadata || {}) as Record<string,unknown>;
 for(const field of ["workflow_id","workflow_revision","slot_id","draft_hash","operation_key"])if(incoming[field]!==undefined && incoming[field]!==piece.ops_content_metadata[field])throw new ContentError("Generation provenance cannot be changed in the post editor.",403);
 const editable=Object.fromEntries(Object.entries(incoming).filter(([key])=>["feed","destination","cta_asset_id","cta_url","asset_family","template_version","required_media","images_as_carousel","subject"].includes(key)));
 patch.ops_content_metadata=validateMetadata({...piece.ops_content_metadata,...editable,managed:"ops"});
 if(!Number.isInteger(body.revision)) throw new ContentError("The current post revision is required.");
 const d=await db();checked(await d.rpc("ops_content_save_piece",{p_id:pieceId,p_company:principal().companyId,p_revision:body.revision,p_patch:patch}));
 return detailPiece(pieceId);
}
export async function approvePiece(pieceId:string,body:Record<string,unknown>) {
 const snapshot=await makeSnapshot(pieceId);
 const piece=await pieceRecord(pieceId),requiredMedia=mandatoryFormat(piece.post_type,snapshot.metadata.post_type).required_media || snapshot.metadata.required_media;
 if(body.revision!==snapshot.revision) throw new ContentError("This post changed. Reload it before approving.",409);
 if(!snapshot.markdown_body.trim()) throw new ContentError("The post needs copy before approval.");
 const video=snapshot.media.some(m=>m.kind==="video");
 if(["video","video_script"].includes(snapshot.content_type) && !video) throw new ContentError("A video script or raw upload is not a finished video. Wait for the final render.",409);
 if((snapshot.content_type==="pdf_guide" || requiredMedia==="pdf") && !snapshot.media.some(m=>m.kind==="document")) throw new ContentError("The finished PDF is required before approval.",409);
 if(requiredMedia==="image" && !snapshot.media.some(m=>m.kind==="image")) throw new ContentError("The finished image is required before approval.",409);
 if(requiredMedia==="video" && !video) throw new ContentError("The finished video is required before approval.",409);
 if(video && body.watched!==true) throw new ContentError("Watch the whole final video with sound before approving it.",409);
 const d=await db();checked(await d.rpc("ops_content_approve_piece",{p_id:pieceId,p_company:principal().companyId,p_revision:snapshot.revision,p_snapshot:snapshot,p_actor:principal().id,p_watched:video}));
 return detailPiece(pieceId);
}
export async function approvedSnapshot(pieceId:string):Promise<PieceSnapshot> {
 const current=await makeSnapshot(pieceId),piece=await pieceRecord(pieceId),d=await db();const r=checked(await d.from("ops_content_reviews").select("*").eq("content_piece_id",pieceId).single());
 if(piece.approval_status!=="approved" || r.approved_revision!==current.revision || r.approved_snapshot?.hash!==current.hash || (current.media.some(m=>m.kind==="video") && r.watched_revision!==current.revision)) throw new ContentError("Approve the current copy and media before exporting or releasing it.",409);
 return r.approved_snapshot;
}
export async function releasePiece(pieceId:string,body:Record<string,unknown>) {
 if(process.env.CONTENT_DIRECT_RELEASE_ENABLED!=="true")throw new ContentError("Direct release needs the guarded publishing worker. Use reviewed export and confirm scheduling in the destination.",422);
 const s=await approvedSnapshot(pieceId);if(body.revision!==s.revision)throw new ContentError("This approval changed. Reload it.",409);
 if(!["social_post","meme"].includes(s.content_type) || s.metadata.destination!=="linkedin_personal" || s.media.some(m=>m.kind!=="image"))throw new ContentError("Direct release supports personal LinkedIn text and images. Export this item for its destination.",422);
 const urls=await Promise.all(s.media.map(m=>promoteMedia(m,pieceId,s.revision)));
 const d=await db();const j=rpcRow(await d.rpc("ops_content_release_piece",{p_id:pieceId,p_company:principal().companyId,p_revision:s.revision,p_snapshot:s,p_actor:principal().id,p_payload:{piece_id:pieceId,commentary:s.delivery.commentary,image_urls:urls,first_comment:s.delivery.first_comment,approval_revision:s.revision,approval_hash:s.hash,approved_snapshot:s,operation_key:body.operationKey}}));
 return {queued:true,jobId:j.id,status:"queued"};
}
