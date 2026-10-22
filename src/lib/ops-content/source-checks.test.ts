import { describe,it,expect,vi } from "vitest";
import { createHash } from "node:crypto";
vi.mock("./store",()=>({db:vi.fn(),principal:vi.fn(),checked:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminSupabaseClient:vi.fn()}));
import { validateSourceChecks } from "./source-checks";
import type { WeeklyPlan,ContentSource } from "./workflow";
const text="Actual supplied test evidence",sha=createHash("sha256").update(text).digest("hex");
function plan():any{return {slots:[{source_ids:["source"]}],source_checks:{source:{sha256:sha}}};}
describe("approval needs current verified source evidence",()=>{
 it("rejects missing checks and changed typed evidence",()=>{expect(()=>validateSourceChecks({slots:[{source_ids:["source"]}]} as WeeklyPlan,[{id:"source",type:"current_story",title:"Test",text}],[])).toThrow("no verified evidence hash");expect(()=>validateSourceChecks(plan(),[{id:"source",type:"current_story",title:"Test",text:"Changed"}],[])).toThrow("evidence changed");});
 it("matches interview evidence to the persisted user turn",()=>{const source:ContentSource={id:"source",kind:"interview",type:"current_story",title:"Test",text:"This alone is untrusted"};expect(()=>validateSourceChecks(plan(),[source],[{id:"source",role:"user",content:text,created_at:"2026-10-11"}])).not.toThrow();});
 it("requires URL identity from the completed verified plan job",()=>{const source:ContentSource={id:"source",type:"asset",title:"Canonical tool",url:"https://public.test/tool"};expect(()=>validateSourceChecks(plan(),[source],[])).toThrow("canonical source identity");expect(()=>validateSourceChecks(plan(),[source],[],[source])).not.toThrow();expect(()=>validateSourceChecks(plan(),[{...source,url:"https://public.test/changed"}],[],[source])).toThrow("canonical source identity");});
});
