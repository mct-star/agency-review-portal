import { describe,it,expect,vi } from "vitest";
import { readFileSync } from "node:fs";
import { dateWeek,legacyContentWeek,parseSources,validatePlan,approvedPlan,type ContentSource,type WeeklySession } from "./workflow";
import { ASSET_TEMPLATE,CTA_ASSETS } from "./catalog";
vi.mock("@/lib/supabase/admin",()=>({createAdminSupabaseClient:vi.fn()}));
const week={date_start:"2026-10-12",date_end:"2026-10-18"};
const sources:ContentSource[]=[{id:"current",type:"current_story",title:"Supplied interview",evidence:"Test evidence",occurred_at:"2026-10-10"},{id:"photo",type:"photo",title:"Supplied photo",media_id:"photo-id",version:"v1"}];
const slot={id:"one",lane:"current_story",feed:"personal",scheduled_date:week.date_start,scheduled_time:"10:30",post_type:"insight",source_ids:["current"],media_ids:[],destination:"linkedin_personal",why:"Use the supplied current source."};
function plan(){return {strategy:"CURRENT_FIRST",considered_magnets:["snake-oil","nhs-trust","assessment-hub"],magnet_decisions:["snake-oil","nhs-trust","assessment-hub"].map(magnet=>({magnet,decision:"hold",why:"No relevant evidence in this test."})),selected_lanes:[],slots:[{...slot}]};}
describe("native weekly plan gates",()=>{
 it("keeps exact Monday dates and confirmed legacy labels independent of ISO keys",()=>{expect(dateWeek(week.date_start)).toEqual({...week,year:2026,week_number:42});expect(legacyContentWeek(week.date_start)).toBe(41);expect(dateWeek("2025-12-29").year).toBe(2026);expect(()=>dateWeek("2026-10-13")).toThrow("Monday");});
 it("accepts dated prior-week evidence and records all magnet decisions",()=>expect(validatePlan(plan(),sources,week).selected_lanes).toEqual(["current_story"]));
 it("rejects stale and unknown story dates",()=>{for(const date of [null,"2026-09-30"]){expect(()=>validatePlan(plan(),[{...sources[0],occurred_at:date}],week)).toThrow("recent source date");}});
 it("rejects a CTA guessed from a campaign attachment",()=>{const p=plan();Object.assign(p.slots[0],{cta_asset_id:"snake-oil",cta_url:"https://example.com/workshop"});expect(()=>validatePlan(p,sources,week)).toThrow("canonical");});
 it("requires matched diagnostics for focused assessment posts",()=>{const p=plan();p.magnet_decisions.find(d=>d.magnet==="assessment-hub")!.decision="include";Object.assign(p.slots[0],{lane:"assessment",assessment_focus:"focused",cta_asset_id:"assessment-hub",cta_url:CTA_ASSETS.find(a=>a.id==="assessment-hub")!.url});expect(()=>validatePlan(p,sources,week)).toThrow("matched diagnostic");});
 it("pins the updated composition only to its lanes",()=>{const p=plan();p.magnet_decisions.find(d=>d.magnet==="nhs-trust")!.decision="include";Object.assign(p.slots[0],{lane:"nhs-trust"});expect(()=>validatePlan(p,sources,week)).toThrow("9 October");Object.assign(p.slots[0],{asset_family:ASSET_TEMPLATE.family,template_version:ASSET_TEMPLATE.version});expect(validatePlan(p,sources,week).slots[0].asset_family).toBe(ASSET_TEMPLATE.family);});
 it("rejects finished cuts without actual transcript timings or verified source captions",()=>{const p=plan();Object.assign(p.slots[0],{lane:"podcast",source_ids:["video"],media_ids:["video-id"],clip:{source_id:"video",media_id:"video-id",start_seconds:5,end_seconds:35,caption_mode:"burn",formats:["9x16"]}});const input:ContentSource={id:"video",type:"podcast",title:"Archive source",media_id:"video-id"};expect(()=>validatePlan(p,[input],week)).toThrow("actual transcript");input.word_timings=[{word:"test",start:5,end:6}];expect(validatePlan(p,[input],week).slots).toHaveLength(1);Object.assign(p.slots[0],{clip:{source_id:"video",media_id:"video-id",start_seconds:5,end_seconds:70,caption_mode:"burn",formats:["9x16"]}});expect(()=>validatePlan(p,[input],week)).toThrow("60 seconds");});
 it("records broad hub promotion and rejects contradictory hold decisions",()=>{const p=plan();Object.assign(p.slots[0],{cta_asset_id:"assessment-hub",cta_url:CTA_ASSETS.find(a=>a.id==="assessment-hub")!.url});expect(()=>validatePlan(p,sources,week)).toThrow("decisions must match");p.magnet_decisions.find(d=>d.magnet==="assessment-hub")!.decision="include";expect(validatePlan(p,sources,week).slots).toHaveLength(1);});
 it("rejects invalid calendar dates without persisting fictional interview evidence",()=>expect(()=>parseSources([{id:"test",type:"current_story",title:"Test",occurred_at:"2026-02-30"}])).toThrow("valid event date"));
 it("canonicalises a selected tactical carousel before the exact plan snapshot is approved",()=>{
  const p=plan();p.slots[0].post_type="tactical";
  const normal=validatePlan(p,sources,week);
  expect(normal.slots[0]).toMatchObject({medium:"carousel",content_type:"social_post",required_media:"pdf",asset_family:"carousel",template_version:null});
  expect(p.slots[0]).not.toHaveProperty("medium");
  expect(validatePlan(normal,sources,week)).toEqual(normal);
  const snapshot={revision:2,plan_json:normal};
  expect(approvedPlan({revision:2,plan_revision:2,plan_status:"approved",plan_markdown:"Fixture",approved_at:"2026-10-11",approved_by:"test",plan_json:normal,approved_snapshot:snapshot} as unknown as WeeklySession)).toEqual(snapshot);
 });
 it("uses canonical database aliases and video requirements without rejecting legacy engine formats",()=>{
  const p=plan();p.slots[0].post_type="problem_post";
  expect(validatePlan(p,sources,week).slots[0]).toMatchObject({medium:"image",content_type:"social_post",required_media:"image"});
  p.slots[0].post_type="reaction_ranking";
  expect(validatePlan(p,sources,week).slots[0]).toMatchObject({medium:"video",content_type:"video_script",required_media:"video"});
  p.slots[0].post_type="problem";
  expect(validatePlan(p,sources,week).slots[0].post_type).toBe("problem");
 });
 it("keeps the shared company header template and rejects an incompatible carousel format",()=>{
  const p=plan();p.magnet_decisions.find(d=>d.magnet==="nhs-trust")!.decision="include";
  Object.assign(p.slots[0],{lane:"nhs-trust",feed:"company",destination:"linkedin_company",asset_family:ASSET_TEMPLATE.family,template_version:ASSET_TEMPLATE.version,post_type:"insight"});
  expect(validatePlan(p,sources,week).slots[0]).toMatchObject({medium:"image",required_media:"image",asset_family:ASSET_TEMPLATE.family});
  p.slots[0].post_type="tactical";
  expect(()=>validatePlan(p,sources,week)).toThrow("image post type");
 });
 it("rejects approval from a superseded revision",()=>expect(()=>approvedPlan({revision:3,plan_revision:2,plan_status:"approved"} as WeeklySession)).toThrow("current weekly plan"));
 it("accepts the worker golden contract unchanged",()=>{
  const fixture=JSON.parse(readFileSync("src/lib/ops-content/fixtures/plan-result.json","utf8"));
  const fixtureSources:ContentSource[]=JSON.parse(readFileSync("src/lib/ops-content/fixtures/source-inventory.json","utf8"));
  expect(validatePlan(fixture.plan_json,fixtureSources,week).slots).toHaveLength(fixture.plan_json.slots.length);
 });
});
