import { beforeEach,describe,expect,it,vi } from "vitest";
const state=vi.hoisted(()=>({admin:{id:"94be5301-3e78-4257-9d41-780a760e9135",email:"mct@agencybristol.com",role:"admin"},error:null}));
vi.mock("@/lib/supabase/admin",()=>({createAdminSupabaseClient:async()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:state.admin,error:state.error})})})})})}));
import { contentSignature,verifyContentRequest } from "./auth";
const secret="test-content-bridge-secret-at-least-32-chars",company="d338c3ca-7f6b-4ea8-9fff-c052ba91bbdd";
function request(body="{}",signedPath="/api/ops-content/weeks",actualPath=signedPath,timestamp=String(Math.floor(Date.now()/1000))){return new Request(`https://portal.test${actualPath}`,{method:"POST",headers:{"x-content-timestamp":timestamp,"x-content-signature":contentSignature("POST",signedPath,timestamp,Buffer.from(body),secret)},body});}
beforeEach(()=>{vi.stubEnv("CONTENT_BRIDGE_SECRET",secret);vi.stubEnv("CONTENT_BRIDGE_COMPANY_ID",company);vi.stubEnv("CONTENT_BRIDGE_USER_ID",state.admin.id);vi.stubEnv("CONTENT_BRIDGE_ACTOR_EMAIL","mct@agencybristol.com");state.admin.role="admin";state.admin.email="mct@agencybristol.com";});
describe("scoped signed content bridge",()=>{
 it("binds to configured company and real administrator",async()=>expect((await verifyContentRequest(request())).companyId).toBe(company));
 it("rejects path or query tampering",async()=>{await expect(verifyContentRequest(request("{}","/api/ops-content/weeks","/api/ops-content/pieces"))).rejects.toMatchObject({status:401});await expect(verifyContentRequest(request("{}","/api/ops-content/pieces","/api/ops-content/pieces?companyId=other"))).rejects.toMatchObject({status:401});});
 it("rejects body tampering",async()=>{const r=request();await expect(verifyContentRequest(new Request(r.url,{method:"POST",headers:r.headers,body:'{"companyId":"other"}'}))).rejects.toMatchObject({status:401});});
 it("rejects stale requests and a different administrator",async()=>{await expect(verifyContentRequest(request("{}",undefined,undefined,"1000000000"))).rejects.toMatchObject({status:401});state.admin.email="other@example.test";await expect(verifyContentRequest(request())).rejects.toMatchObject({status:403});});
 it("fails closed on an unconfigured bridge and bounds body reads",async()=>{vi.stubEnv("CONTENT_BRIDGE_SECRET","");await expect(verifyContentRequest(request())).rejects.toMatchObject({status:503});vi.stubEnv("CONTENT_BRIDGE_SECRET",secret);await expect(verifyContentRequest(request("x".repeat(4*1024*1024+1)))).rejects.toMatchObject({status:413});});
});
