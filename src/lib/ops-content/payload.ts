import type { ContentPrincipal } from "./principal";
import { POST_TYPES } from "@/lib/constants/post-types";
import type { WeeklySession } from "./workflow";
import { ASSET_TEMPLATE,CTA_ASSETS,MAIN_MAGNETS } from "./catalog";
export function weeklyPayload(session:WeeklySession,week:{id:string;week_number:number;date_start:string;date_end:string},actor:ContentPrincipal,media:Record<string,unknown>[],operationKey:unknown,approved?:Record<string,unknown>) {
 return {workflow_id:session.id,workflow_revision:session.revision,week_id:week.id,company_id:actor.companyId,week:week.week_number,year:Number(week.date_start.slice(0,4)),date_start:week.date_start,date_end:week.date_end,legacy_week_label:Number(session.legacy_week_label),
 interview:{messages:session.messages,answers:session.answers},source_inventory:session.source_inventory,media,approved_plan:approved,post_type_registry:POST_TYPES.map(({slug,dbSlug,medium,contentType})=>({slug,db_slug:dbSlug,medium,content_type:contentType})),reporting:"platform",model:actor.model,strategy:"CURRENT_FIRST",considered_magnets:MAIN_MAGNETS,cta_assets:CTA_ASSETS,asset_template:ASSET_TEMPLATE,phase:"A",mode:"resume",drafts_only:true,auto_phase_b:false,operation_key:operationKey};
}
