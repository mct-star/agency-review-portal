import { describe,it,expect } from "vitest";
import { mandatoryFormat } from "./formats";

describe("mandatory final format requirements",()=>{
 it("overrides supplied no-media metadata for Tactical",()=>expect({...{required_media:"none",asset_family:null},...mandatoryFormat("tactical")}).toEqual({required_media:"pdf",asset_family:"carousel"}));
 it("requires a finished video for canonical video formats",()=>expect(mandatoryFormat("reaction_ranking")).toEqual({required_media:"video"}));
 it("keeps current copy-only defaults for image and text formats",()=>{expect(mandatoryFormat("problem_post")).toEqual({});expect(mandatoryFormat("poll_question")).toEqual({});});
 it("uses canonical metadata only when the stored type is an unregistered alias",()=>{expect(mandatoryFormat("legacy-alias","tactical")).toEqual({required_media:"pdf",asset_family:"carousel"});expect(mandatoryFormat("insight","tactical")).toEqual({});});
});
