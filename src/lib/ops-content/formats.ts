import { getPostType,POST_TYPES } from "@/lib/constants/post-types";

/** Mandatory final assets for structured formats, independent of editable metadata. */
export function mandatoryFormat(postType:unknown,fallback:unknown=undefined):{required_media?:"pdf"|"video";asset_family?:"carousel"} {
 const resolve=(slug:unknown)=>typeof slug==="string"?(getPostType(slug) || POST_TYPES.find(type=>type.dbSlug===slug)):undefined;
 const type=resolve(postType) || resolve(fallback);
 if(type?.medium==="carousel")return {required_media:"pdf",asset_family:"carousel"};
 if(type?.medium==="video")return {required_media:"video"};
 return {};
}
