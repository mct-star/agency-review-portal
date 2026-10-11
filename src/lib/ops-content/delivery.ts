export function deliveryState(review:Record<string,any>,jobs:Record<string,any>[],publications:Record<string,any>[]) {
 const job=jobs.find(j=>j.id===review.release_job_id),intent=publications.find(p=>p.publish_payload?.native_ops===true);
 const confirmed=publications.find(p=>p.status==="published" && p.external_url);
 if(confirmed || intent){
  const record=confirmed || intent!,payload=record.publish_payload || {};
  const matches=payload.native_ops===true && Number.isInteger(payload.approval_revision) && payload.approval_revision===review.revision && review.approved_revision===review.revision && typeof payload.approval_hash==="string" && payload.approval_hash===review.approved_snapshot?.hash;
  if(!matches)return {status:"reconciliation_required",postUrl:record.external_url || null,publishedRevision:payload.approval_revision || null,publishedHash:payload.approval_hash || null,commentError:null,requiresReconciliation:true,errorMessage:"The publication record belongs to a different approved version. Reconcile it before another release; create a new post to change published copy."};
 }
 if(confirmed)return {status:"published",postUrl:confirmed.external_url,publishedRevision:confirmed.publish_payload.approval_revision,publishedHash:confirmed.publish_payload.approval_hash,commentError:job?.output_payload?.comment_error || null,requiresReconciliation:false};
 if(intent){const uncertain=job?.status==="failed" || !job || intent.status!=="running";return {status:uncertain?"reconciliation_required":"running",postUrl:null,commentError:null,requiresReconciliation:uncertain,errorMessage:uncertain?"Publication outcome is unknown. Check the destination and reconcile the saved intent before another release.":"Publication is in progress. Another release is blocked."};}
 if(job && ["queued","running"].includes(job.status))return {status:job.status==="queued"?"queued":"running",postUrl:null,requiresReconciliation:false};
 if(job?.status==="failed")return {status:"failed",postUrl:null,requiresReconciliation:false,errorMessage:job.error_message || "Release failed before a confirmed publication."};
 if(review.exported_at)return {status:"exported",postUrl:null,requiresReconciliation:false,scheduled:false};
 return {status:review.approved_revision===review.revision?"approved":"generated",postUrl:null,requiresReconciliation:false};
}
