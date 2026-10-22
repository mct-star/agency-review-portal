/** Verified website destinations. IDs carry workflow intent, never attachment order. */
export const CTA_ASSETS = [
  { id: "snake-oil", title: "Snake Oil and Ladders", url: "https://agencymedicalmarketing.com/tools/snake-oil-and-ladders", campaign_key: "snake-oil" },
  { id: "nhs-trust", title: "NHS Trust Intelligence", url: "https://trusts.agencymedicalmarketing.com/", campaign_key: "nhs-trust" },
  { id: "assessment-hub", title: "Assessments", url: "https://agencymedicalmarketing.com/assessments", campaign_key: "assessment" },
  ...["launch", "market-entry", "patient-marketing", "events", "capability", "marketing-maturity"].map(slug => ({ id: `assessment-${slug}`, title: slug, url: `https://agencymedicalmarketing.com/assessments/${slug}`, campaign_key: "assessment" })),
  { id: "newsletter", title: "Newsletter", url: "https://agencymedicalmarketing.com/insights#newsletter", campaign_key: null },
  { id: "podcast", title: "Podcast", url: "https://agencymedicalmarketing.com/podcast", campaign_key: null },
] as const;
export const MAIN_MAGNETS = ["snake-oil", "nhs-trust", "assessment-hub"] as const;
export const FILLER_LANES = ["podcast", "skit", "newsletter", "nhs-trust", "snake-oil", "assessment"] as const;
export const ASSET_TEMPLATE = { family: "header-only-direction-a", version: "2026-10-09", dimensions: "1080x1350", applies_to: ["snake-oil", "nhs-trust"], source: "Header_Only/Final/build_final.py", personal_feed: "debranded", company_feed: "debranded" };

export const DEFAULT_SOURCES = MAIN_MAGNETS.map(id=>{const a=CTA_ASSETS.find(a=>a.id===id)!;return {id:`registry-${id}`,type:"asset" as const,title:a.title,url:a.url,kind:"canonical_asset",last_used_at:null};});
