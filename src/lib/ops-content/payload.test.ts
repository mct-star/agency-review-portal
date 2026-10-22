import { describe,it,expect,vi } from "vitest";
import { readFileSync,writeFileSync,existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { weeklyPayload } from "./payload";
import { POST_TYPES } from "@/lib/constants/post-types";
import { validatePlan,type WeeklySession } from "./workflow";
vi.mock("@/lib/supabase/admin",()=>({createAdminSupabaseClient:vi.fn()}));
const company="d338c3ca-7f6b-4ea8-9fff-c052ba91bbdd",actor="94be5301-3e78-4257-9d41-780a760e9135",workflow="00000000-0000-4000-8000-000000000021",weekId="00000000-0000-4000-8000-000000000022";
const week={id:weekId,week_number:42,date_start:"2026-10-12",date_end:"2026-10-18"};
const fixture=JSON.parse(readFileSync("src/lib/ops-content/fixtures/plan-result.json","utf8")),sources=JSON.parse(readFileSync("src/lib/ops-content/fixtures/source-inventory.json","utf8"));
const media=sources.filter((s:any)=>s.media_id).map((s:any)=>({id:s.media_id,company_id:company,bucket:"captures",storage_path:`${company}/${s.type==='skit'?'video':'source'}/${s.media_id}.${s.type==='podcast'||s.type==='skit'?'mp4':'jpg'}`,kind:s.type==='podcast'||s.type==='skit'?"video":"photo",role:s.type==='podcast'?"source":"final",version:"fixture-version",filename:"Fixture only",mime_type:s.type==='podcast'||s.type==='skit'?"video/mp4":"image/jpeg",size_bytes:123,has_burned_captions:s.has_burned_captions===true,rights:{allowed:true,source:"Synthetic test permission, not an actual media licence."},finished:s.type!=="podcast"}));
const session={id:workflow,company_id:company,week_id:weekId,revision:3,legacy_week_label:"41",source_inventory:sources,plan_json:fixture.plan_json,plan_markdown:fixture.plan_markdown,messages:[{id:"interview-1",role:"user",content:sources[0].evidence,created_at:"2026-10-11T12:00:00Z"}],answers:{}} as WeeklySession;
const approved={workflow_id:workflow,revision:3,markdown:session.plan_markdown,plan_json:session.plan_json,source_inventory:sources,media,dates:{date_start:week.date_start,date_end:week.date_end},approved_at:"2026-10-11T12:00:00Z",approved_by:actor,selected_lanes:session.plan_json!.selected_lanes};
const payload=weeklyPayload(session,week,{id:actor,companyId:company,role:"admin",model:"claude-sonnet-5-5",modelLabel:"Claude Sonnet 5.5"},media,"00000000-0000-4000-8000-000000000023",approved);
const job={id:"00000000-0000-4000-8000-000000000024",company_id:company,week_id:weekId,job_type:"ops_weekly_production",provider:"markey_platform",status:"queued",input_payload:payload};
describe("browser plan to platform worker contract",()=>{
 it("preserves the golden plan, approved dates and exact media declarations",()=>{expect(validatePlan(fixture.plan_json,sources,week)).toEqual(fixture.plan_json);expect(payload.approved_plan).toBe(approved);expect(payload.media).toEqual(approved.media);expect(payload.legacy_week_label).toBe(41);expect(payload.year).toBe(2026);expect(payload.auto_phase_b).toBe(false);expect(payload.drafts_only).toBe(true);});
 it("supplies only the current canonical format registry without changing approved slots",()=>{
  expect(payload.post_type_registry).toEqual(POST_TYPES.map(({slug,dbSlug,medium,contentType})=>({slug,db_slug:dbSlug,medium,content_type:contentType})));
  expect(payload.post_type_registry.find(type=>type.slug==="tactical")).toEqual({slug:"tactical",db_slug:"tactical",medium:"carousel",content_type:"social_post"});
  expect(payload.approved_plan?.plan_json).toBe(session.plan_json);
  expect(payload.approved_plan).not.toHaveProperty("post_type_registry");
 });
 it("keeps the API-created job fixture stable and validates it with the actual local worker",()=>{
  const path="src/lib/ops-content/fixtures/weekly-production-job.json";
  if(process.env.UPDATE_CONTENT_CONTRACT_FIXTURE==="1")writeFileSync(path,JSON.stringify(job,null,2)+"\n");
  expect(JSON.parse(readFileSync(path,"utf8"))).toEqual(job);
  const worker="../agency-ops/scripts/content-worker";
  if(existsSync(`${worker}/protocol.py`))expect(execFileSync("python3",["-c","import sys,json;sys.path.insert(0,sys.argv[1]);from protocol import validate_job;validate_job(json.load(sys.stdin));print('validated')",worker],{input:JSON.stringify(job),encoding:"utf8"}).trim()).toBe("validated");
 });
});
