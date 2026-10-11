import { beforeEach,describe,expect,it,vi } from "vitest";
const state=vi.hoisted(()=>({piece:{} as any,review:{} as any,media:[] as any[],rpc:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminSupabaseClient:vi.fn()}));
vi.mock("./media",()=>({mediaForPiece:async()=>state.media,signedMedia:async(m:any)=>m,promoteMedia:vi.fn()}));
vi.mock("./store",()=>({
 principal:()=>({id:"actor",companyId:"company"}),pieceRecord:async()=>state.piece,
 checked:(r:any)=>{if(r.error)throw r.error;return r.data;},rpcRow:(r:any)=>r.data,
 db:async()=>({rpc:state.rpc,from:(table:string)=>{
  const result=()=>({data:table==="ops_content_reviews"?state.review:[],error:null});
  const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>result(),single:async()=>result(),then:(resolve:any)=>Promise.resolve(result()).then(resolve)};
  return q;
 }})
}));
import { approvePiece } from "./review";

beforeEach(()=>{
 state.piece={id:"piece",post_type:"tactical",content_type:"social_post",title:"Fixture",markdown_body:"Fixture copy only.",first_comment:null,scheduled_date:null,scheduled_time:null,approval_status:"pending",ops_content_metadata:{feed:"personal",destination:"linkedin_personal",post_type:"tactical",required_media:"none"}};
 state.review={revision:1,approved_revision:null,approved_snapshot:null};state.media=[];
 state.rpc.mockReset();state.rpc.mockImplementation(async(_name:string,args:any)=>{state.review={...state.review,approved_revision:1,approved_snapshot:args.p_snapshot};return {data:state.review,error:null};});
});

describe("actual Single approval guard",()=>{
 it("rejects a Tactical post with forged no-media metadata before any approval write",async()=>{await expect(approvePiece("piece",{revision:1})).rejects.toThrow("finished PDF");expect(state.rpc).not.toHaveBeenCalled();});
 it("does not substitute slides or a source PDF for the finished carousel",async()=>{state.media=[{id:"slide",kind:"image",role:"final",version:"v1"},{id:"raw",kind:"document",role:"source",version:"v2"}];await expect(approvePiece("piece",{revision:1})).rejects.toThrow("finished PDF");expect(state.rpc).not.toHaveBeenCalled();});
 it("approves the exact attached final PDF",async()=>{state.media=[{id:"pdf",kind:"document",role:"final",version:"sha-final",filename:"Fixture.pdf"}];await approvePiece("piece",{revision:1});expect(state.rpc).toHaveBeenCalledWith("ops_content_approve_piece",expect.objectContaining({p_snapshot:expect.objectContaining({media:[expect.objectContaining({id:"pdf",version:"sha-final"})]})}));});
 it("resolves a legacy stored alias from canonical generation metadata",async()=>{state.piece.post_type="legacy-alias";await expect(approvePiece("piece",{revision:1})).rejects.toThrow("finished PDF");expect(state.rpc).not.toHaveBeenCalled();});
 it("preserves image Single copy-only approval",async()=>{state.piece.post_type="problem_post";state.piece.ops_content_metadata.post_type="insight";await approvePiece("piece",{revision:1});expect(state.rpc).toHaveBeenCalledOnce();});
 it("cannot bypass a canonical video requirement with ordinary social copy",async()=>{state.piece.post_type="reaction_ranking";state.piece.ops_content_metadata.post_type="reaction_ranking";await expect(approvePiece("piece",{revision:1})).rejects.toThrow("finished video");expect(state.rpc).not.toHaveBeenCalled();});
});
