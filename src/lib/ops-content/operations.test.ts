import { beforeEach,describe,expect,it,vi } from "vitest";
const state=vi.hoisted(()=>({record:null as any,pieces:[] as any[],jobs:[] as any[],detail:vi.fn()}));
vi.mock("./review",()=>({snapshotHash:(v:unknown)=>JSON.stringify(v),detailPiece:(id:string)=>state.detail(id)}));
vi.mock("./store",()=>({id:(v:unknown)=>v,principal:()=>({companyId:"company"}),checked:(r:any)=>{if(r.error)throw Error("storage");return r.data;},db:async()=>({from:(table:string)=>{
 let result:any={data:table==="content_pieces"?state.pieces:table==="content_generation_jobs"?state.jobs:state.record,error:null};const q:any={select:()=>q,eq:()=>q,contains:()=>q,limit:()=>q,single:()=>q,insert:(row:any)=>{if(state.record)result={data:null,error:{code:"23505"}};else{state.record={...row,state:"running"};result={data:null,error:null};}return q;},update:(row:any)=>{state.record={...state.record,...row};result={data:null,error:null};return q;},then:(resolve:any)=>Promise.resolve(result).then(resolve)};return q;
}})}));
import { operation } from "./operations";
import { ContentError } from "./auth";
vi.mock("@/lib/supabase/admin",()=>({createAdminSupabaseClient:vi.fn()}));
const key="00000000-0000-4000-8000-000000000001",body={operationKey:key,topic:"Test source"};
beforeEach(()=>{state.record=null;state.pieces=[];state.jobs=[];state.detail.mockReset();state.detail.mockResolvedValue({piece:{id:"saved-piece",media:[],review:{revision:1}},media:[],jobs:[]});});
describe("durable operation retry outcomes",()=>{
 it("replays the full response after a lost HTTP response without running twice",async()=>{const action=vi.fn().mockResolvedValue({piece:{id:"saved-piece",review:{revision:1}},media:[]});const first=await operation("POST","/generate",body,action);const retry=await operation("POST","/generate",body,action);expect(retry).toEqual(first);expect((retry.body as any).piece.id).toBe("saved-piece");expect((retry.body as any).operationState).toBe("complete");expect(action).toHaveBeenCalledTimes(1);});
 it("recovers the actual saved draft when interrupted after insert",async()=>{state.record={request_hash:JSON.stringify({method:"POST",path:"/generate",body}),state:"running"};state.pieces=[{id:"saved-piece"}];const action=vi.fn();const r=await operation("POST","/generate",body,action);expect((r.body as any).piece.id).toBe("saved-piece");expect((r.body as any).operationState).toBe("running");expect(action).not.toHaveBeenCalled();});
 it("marks a definitive completed model failure so the client can start a fresh operation",async()=>{const r=await operation("POST","/generate",body,async()=>{throw new ContentError("Model unavailable",503);});expect(r.status).toBe(503);expect(r.body).toMatchObject({operationState:"complete",error:"Model unavailable"});});
 it("retains an unknown in-flight claim and rejects changed input",async()=>{state.record={request_hash:JSON.stringify({method:"POST",path:"/generate",body}),state:"running"};const action=vi.fn();await expect(operation("POST","/generate",body,action)).rejects.toMatchObject({status:409});await expect(operation("POST","/generate",{...body,topic:"Another source"},action)).rejects.toMatchObject({status:409});expect(action).not.toHaveBeenCalled();});
});
