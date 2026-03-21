/**
 * Regulatory Knowledge Base
 *
 * Compiled from AGENCY Bristol's proprietary legal and regulatory research:
 * - ABPI Code of Practice and Social Media (2022 guidelines)
 * - France: ANSM regulations (CMS Law analysis)
 * - Germany: HWG / FSA / AKG regulations (CMS Law analysis)
 * - Belgium: LMP / RDAMP / FAMHP regulations (ICLG analysis)
 * - Netherlands: Medicines Act / Code PA regulations (CMS Law analysis)
 * - UK: MHRA Blue Guide, MDR advertising guidelines
 * - Zimmer Biomet regulatory review precedents
 *
 * This knowledge base is used by the regulatory review module to flag
 * compliance issues in generated healthcare content.
 */

// ── Country Regulatory Profiles ─────────────────────────────

export interface CountryRegProfile {
  code: string;
  name: string;
  language: string;
  regulatoryBody: string;
  keyLegislation: string[];
  socialMediaRules: string[];
  brandMentionRules: string[];
  productMentionRules: string[];
  serviceMentionRules: string[];
  hcpAdvertisingRules: string[];
  enforcementRisks: string[];
}

export const COUNTRY_PROFILES: Record<string, CountryRegProfile> = {
  GB: {
    code: "GB",
    name: "United Kingdom",
    language: "en",
    regulatoryBody: "MHRA (Medicines and Healthcare products Regulatory Agency) / ABPI / PMCPA",
    keyLegislation: [
      "ABPI Code of Practice (2021)",
      "Blue Guide: Advertising and Promotion of Medicines in the UK (3rd ed.)",
      "MDR advertising guidelines",
      "Consumer Protection from Unfair Trading Regulations 2008",
    ],
    socialMediaRules: [
      "A product name (trade or generic) combined with indications is likely to be considered PROMOTIONAL",
      "If employee can reasonably be perceived as representing the company, personal social media comes in scope",
      "Companies are responsible for content posted by contracted third parties",
      "All social media from contracted parties should be previewed by the pharmaceutical company",
      "Regular training on 'responsible conduct on social media' is required",
      "Hashtags with promotional claims for a POM (Prescription Only Medicine) are considered promotional",
      "Proactively sharing a publication about a medicinal product is likely considered promotion and is prohibited",
      "Links must be named clearly and state ownership; due diligence required on linked content",
      "Misinformation can be corrected by cross-referencing to the SmPC or PIL (link to whole document only, not specific sections)",
      "Signposting to events requires non-promotional invitations with validated attendees",
    ],
    brandMentionRules: [
      "Company brand mentions are generally permitted in corporate communications",
      "Must distinguish promotional from non-promotional content",
      "Transparency required: company involvement must be clearly stated at the outset",
      "Do NOT mention POMs (Prescription Only Medicines) in job titles or profile descriptions",
      "Corporate news, executive appointments, awards, and partnerships are generally safe",
    ],
    productMentionRules: [
      "Advertising prescription-only medicines to the general public is PROHIBITED",
      "Product name + indication = promotional content (requires compliance review)",
      "Clinical trial recruitment posts must NOT mention the name of the medicine",
      "Cannot share information about products or pipeline assets including clinical research on social media",
      "Free samples may only be provided to authorised prescribers upon request, in limited quantities",
    ],
    serviceMentionRules: [
      "Healthcare services can be promoted but must not make misleading therapeutic claims",
      "Disease awareness campaigns must be non-promotional and not attributable to a specific product",
      "Patient support programmes must not be used as a vehicle for product promotion",
    ],
    hcpAdvertisingRules: [
      "ABPI Code governs all interactions with HCPs",
      "PMCPA administers the code — 73% of social media cases breached the code",
      "Companies should consider carefully before facilitating discussions about medicinal products on social media",
    ],
    enforcementRisks: [
      "PMCPA complaints can result in public rulings, required corrective statements, and suspension from ABPI membership",
      "MHRA can issue enforcement notices and refer for prosecution",
      "22 social media cases reported; 16 companies involved; 73% breach rate",
    ],
  },

  FR: {
    code: "FR",
    name: "France",
    language: "fr",
    regulatoryBody: "ANSM (Agence nationale de securite du medicament et des produits de sante)",
    keyLegislation: [
      "Code de la Sante Publique (CSP)",
      "ANSM advertising guidelines",
      "Charter for Communication and Promotion of Health Products on Internet and e-Media",
    ],
    socialMediaRules: [
      "Promotion of health products on OPEN social networks is FORBIDDEN unless moderation of comments and deactivation of 'like' features is possible",
      "Advertisements reserved to HCPs must be on sites accessible ONLY by HCPs",
      "Mobile health apps on public platforms require moderation capability and deactivation of comments/ratings/recommendations",
      "Websites must clearly distinguish promotional pages from institutional pages",
      "Discussion forums require true moderation services",
    ],
    brandMentionRules: [
      "Company brand mentions in corporate context generally permitted",
      "All advertising must clearly identify the pharmaceutical company",
      "Transparency about company involvement is mandatory",
    ],
    productMentionRules: [
      "Advertising prescription medicines to the general public is PROHIBITED",
      "ALL advertising to HCPs requires prior authorisation ('visa PM') from ANSM",
      "Visa PM is valid for maximum 2 years and cannot exceed validity of marketing authorisation",
      "Advertising must include: name, MA numbers, pharmacological properties, indications, contraindications, dosage, adverse effects, warnings, drug interactions, price",
      "Studies used must be from peer-reviewed journals and conducted under MA conditions",
      "Unpublished studies may only be used if from the MA file",
      "Results must focus primarily on primary criteria; secondary criteria only alongside primary",
    ],
    serviceMentionRules: [
      "Healthcare service advertising must comply with general CSP rules",
      "Disease awareness is permitted if non-promotional",
    ],
    hcpAdvertisingRules: [
      "Since 2012, ALL advertising to HCPs requires prior ANSM authorisation (visa PM)",
      "Fee must be paid for visa PM application",
      "If ANSM does not respond within 2 months, visa is deemed granted",
      "Free samples only at HCP request, limited quantities, no psychotropic/narcotic substances",
    ],
    enforcementRisks: [
      "Advertising without visa PM: 1 year imprisonment + EUR 150,000 fine",
      "Financial sanctions up to 30% of turnover for the product, max EUR 1,000,000",
      "Daily penalties up to EUR 2,500 per day",
      "Sanctions can be published online",
      "Criminal and financial sanctions can be combined (total cannot exceed highest maximum)",
    ],
  },

  DE: {
    code: "DE",
    name: "Germany",
    language: "de",
    regulatoryBody: "BfArM / FSA / AKG (self-regulatory)",
    keyLegislation: [
      "Heilmittelwerbegesetz (HWG) - Health Services and Products Advertising Act",
      "Unfair Competition Act (UWG) Section 6",
      "FSA Code of Collaboration with Healthcare Professionals",
      "AKG Code of Conduct for Healthcare Professionals",
    ],
    socialMediaRules: [
      "Social media advertising is LIMITED to OTC medicines and medical devices ONLY",
      "Prescription-only medicine advertising on social media is NOT POSSIBLE (access restriction not technically feasible)",
      "Websites with prescription medicine content must have access control (tick-box is NOT sufficient; DocCheck-style registration required)",
      "A visible link to mandatory information (Pflichtangaben) is sufficient on internet/social media",
      "No prior approval required — Germany uses self-assessment model",
    ],
    brandMentionRules: [
      "Company brand mentions permitted in corporate context",
      "'Reminder advertising' (Erinnerungswerbung) may refer only to medicine name and/or company name — no mandatory information required",
      "Must not use recommendations/testimonials from scientists, HCPs, or celebrities",
    ],
    productMentionRules: [
      "Advertising prescription-only medicines to general public is PROHIBITED",
      "Off-label advertising (indications not covered by MA) is PROHIBITED",
      "ALL medicine advertisements must contain Pflichtangaben (mandatory information): company name, medicine name, composition, indications, contraindications, side effects, warnings, and prescription status",
      "Clinical studies supporting claims must meet 'gold standard': prospective, randomised, controlled, double-blind, adequately powered, published",
      "Sub-group analyses, meta-analyses, and data on file must be clearly labelled with their limitations",
      "It is PROHIBITED to offer advertising gifts or benefits to consumers in connection with medicine promotion (Section 7 HWG)",
    ],
    serviceMentionRules: [
      "Healthcare service advertising subject to general HWG rules",
      "Must not be misleading or make unsubstantiated therapeutic claims",
      "Contests, prize draws, or chance-based procedures are prohibited",
      "Advertising must not be aimed predominantly at children under 14",
    ],
    hcpAdvertisingRules: [
      "No prior licensing/approval required for HCP advertising (self-assessment model)",
      "Comparative advertising to HCPs is allowed with restrictions",
      "Head-to-head clinical study data required for comparative claims",
      "All scientific references must state author names, publication date, and correct citation",
    ],
    enforcementRisks: [
      "Primarily enforced through civil courts and competitor lawsuits",
      "Cease-and-desist orders (Unterlassung) are the most common remedy",
      "Interim injunction proceedings are typical due to time pressure",
      "Administrative offence proceedings (Ordnungswidrigkeitenverfahren) are rare but possible",
      "FSA/AKG arbitration boards adjudicate member violations",
      "Criminal proceedings under Section 3 HWG possible in extreme cases",
    ],
  },

  BE: {
    code: "BE",
    name: "Belgium",
    language: "nl",
    regulatoryBody: "FAMHP (Federal Agency for Medicines and Health Products) / Pharma.be / Mdeon",
    keyLegislation: [
      "Law of Medicinal Products (LMP) of 25 March 1964",
      "Royal Decree (RDAMP) of 7 April 1995",
      "Sunshine Act (transparency obligations)",
      "Pharma.be deontological codes",
    ],
    socialMediaRules: [
      "Promotion of prescription medicines via social media (Facebook, Twitter) is PROHIBITED",
      "Advertising via email, fax, or mailing to HCPs is NOT prohibited IF prior consent obtained",
      "Online advertising must contain clearly visible statement that it is an advertisement",
      "Company identity must be identifiable in all online advertising",
      "Teaser advertisements referring to upcoming product data are considered advertising and subject to all rules",
      "Linking to independent websites is interpreted as endorsement — active monitoring advised",
      "Companies should include clear disclaimers for linked content outside their control",
    ],
    brandMentionRules: [
      "Company brand mentions in corporate communications generally permitted",
      "Sunshine Act requires disclosure of premiums/benefits granted to HCPs, healthcare organisations, and patient organisations",
      "Endorsements by HCPs in promotional materials are not expressly prohibited but must be objective, truthful, verifiable, and unpaid",
      "Employee social media activity about company products should be avoided — wide reach makes compliance difficult",
    ],
    productMentionRules: [
      "Advertising prescription-only medicines to the general public is EXPRESSLY PROHIBITED",
      "Advertising non-authorised medicines is prohibited",
      "Advertisements to HCPs must cover 50% of advertising space with essential data from SmPC",
      "Price must be bold, contrasting background, upper right corner, covering 0.5% of ad space",
      "PROHIBITED means of advertising: airplanes, billboards, telephone, SMS, children's magazines, leaflets, contests, software programs",
      "HCP endorsements must be limited to KOLs in relevant therapeutic area who conducted/were involved in relevant research",
    ],
    serviceMentionRules: [
      "Healthcare service advertising must not make misleading therapeutic claims",
      "Disease awareness must be complete, objective, and mention all available treatments per therapeutic class without brand names",
      "No specific additional restrictions beyond general advertising rules",
    ],
    hcpAdvertisingRules: [
      "No prior notification or approval required for advertising to HCPs",
      "Advertisements must be accurate, up-to-date, objective, sufficiently complete, truthful, verifiable",
      "Information must be compatible with SmPC and MA dossier",
      "Virtual congress/meeting rules: adequate safeguards required, identify booth visitors, restrict access accordingly",
    ],
    enforcementRisks: [
      "Ministry of Health can prevent non-compliant advertising",
      "Visa requirement for radio/television advertising to general public",
      "30-day prior notification required for other general public advertising",
      "Sunshine Act violations result in transparency penalties",
    ],
  },

  NL: {
    code: "NL",
    name: "Netherlands",
    language: "nl",
    regulatoryBody: "Ministry of Health / Code PA (Gedragscode Geneesmiddelenreclame)",
    keyLegislation: [
      "Medicines Act (Geneesmiddelenwet)",
      "Dutch Civil Code (6:194-196) on misleading/comparing advertising",
      "Code PA (Code for Pharmaceutical Advertisement)",
      "Code AGP (Advertising of Medicinal Products to the General Public)",
    ],
    socialMediaRules: [
      "No specific social media provisions — general advertising rules apply",
      "Prescription-only medicines cannot be advertised to the general public on any channel including social media",
      "Advertising nature must be recognisable in all formats",
    ],
    brandMentionRules: [
      "Company brand mentions in corporate context permitted",
      "All advertising must clearly identify the responsible party (name and address)",
      "Transparency about promotional nature is mandatory",
    ],
    productMentionRules: [
      "Advertising medicines without MA (marketing authorisation) is PROHIBITED",
      "Prescription-only and Opium Act-listed medicines may NEVER be advertised to the general public",
      "Written advertising to HCPs must include: product name, manufacturer, composition, pharmaco-therapeutic group, indications, adverse reactions, warnings, contraindications, classification",
      "Claims must be accurate, up-to-date, truthful, correct, and verifiable",
      "Source references required for all passages; quotes must be accurately reproduced",
      "Comparative advertising must compare similar products with objective, verifiable, representative features",
      "Vague terms and superlatives must be avoided in promoting rational use",
    ],
    serviceMentionRules: [
      "Healthcare service advertising subject to general Medicines Act rules",
      "Must not be misleading or make unsubstantiated claims",
    ],
    hcpAdvertisingRules: [
      "No licensing system for HCP advertising — industry expected to self-comply",
      "Comparative advertising allowed but must not discredit competitors",
      "Must not create confusion between advertiser and competitor",
    ],
    enforcementRisks: [
      "Civil enforcement through courts",
      "Industry self-regulation through Code PA",
      "Regulatory oversight by Ministry of Health",
    ],
  },

  IT: {
    code: "IT",
    name: "Italy",
    language: "it",
    regulatoryBody: "AIFA (Agenzia Italiana del Farmaco)",
    keyLegislation: [
      "Legislative Decree 219/2006 (Pharmaceutical Code)",
      "Farmindustria Code of Ethics",
    ],
    socialMediaRules: [
      "Prescription medicine advertising to general public prohibited",
      "Social media activity subject to general pharmaceutical advertising rules",
      "AIFA monitoring of online pharmaceutical advertising",
    ],
    brandMentionRules: [
      "Company brand mentions in corporate context permitted",
      "Transparency about company identity required",
    ],
    productMentionRules: [
      "Prescription medicine advertising to public prohibited",
      "Prior AIFA authorisation required for some forms of advertising",
      "All claims must be based on approved SmPC",
    ],
    serviceMentionRules: [
      "Healthcare service advertising permitted with standard restrictions",
    ],
    hcpAdvertisingRules: [
      "HCP advertising must comply with AIFA guidelines",
      "Claims must be scientifically substantiated",
    ],
    enforcementRisks: [
      "AIFA enforcement actions",
      "Farmindustria self-regulatory proceedings",
    ],
  },

  ES: {
    code: "ES",
    name: "Spain",
    language: "es",
    regulatoryBody: "AEMPS (Agencia Espanola de Medicamentos y Productos Sanitarios)",
    keyLegislation: [
      "Royal Decree 1416/1994",
      "Farmaindustria Code of Good Practice",
    ],
    socialMediaRules: [
      "Prescription medicine advertising to general public prohibited",
      "Digital advertising subject to same rules as traditional advertising",
    ],
    brandMentionRules: [
      "Company brand mentions in corporate context permitted",
    ],
    productMentionRules: [
      "Prescription medicine advertising to public prohibited",
      "All product claims must be based on SmPC",
      "Prior authorisation may be required for certain advertising",
    ],
    serviceMentionRules: [
      "Healthcare service advertising permitted with standard restrictions",
    ],
    hcpAdvertisingRules: [
      "HCP advertising regulated by AEMPS",
      "Farmaindustria Code applies to member companies",
    ],
    enforcementRisks: [
      "AEMPS enforcement",
      "Farmaindustria self-regulatory proceedings",
    ],
  },
};

// ── Universal Healthcare Marketing Rules ─────────────────────

export const UNIVERSAL_RULES = {
  brandVsProduct: `
CRITICAL DISTINCTION — BRAND vs PRODUCT vs SERVICE:

1. BRAND MENTIONS (Legal implications — advertising law)
   - Company name, company brand, corporate identity
   - Generally PERMITTED in corporate communications
   - Must be transparent about company involvement
   - Subject to general advertising law (misleading claims, comparative advertising)

2. PRODUCT MENTIONS (Regulatory implications — medicines/device regulation)
   - Specific medicine names, device names, product indications
   - Prescription medicines: PROHIBITED to advertise to general public in ALL EU/UK markets
   - Product name + indication = PROMOTIONAL content (triggers full regulatory compliance)
   - Medical devices: subject to MDR/IVDR regulations
   - Off-label promotion: PROHIBITED everywhere

3. SERVICE MENTIONS (Mixed legal/regulatory)
   - Healthcare services, clinical services, diagnostic services
   - Generally PERMITTED but must not make misleading therapeutic claims
   - Disease awareness campaigns must be non-promotional
   - Must not be a vehicle for indirect product promotion
`,

  socialMediaSpecific: `
SOCIAL MEDIA — UNIVERSAL RULES:

1. Prescription medicine promotion on public social media is effectively PROHIBITED across all EU/UK markets
2. Company employee personal accounts CAN come in scope if the employee is perceived as representing the company
3. Product name + hashtag that could identify a prescription medicine = potentially promotional
4. Proactively sharing publications about specific medicines is likely considered promotion
5. Links must be checked for compliance — the linking company may be held responsible for linked content
6. Comments/engagement on promotional posts may trigger pharmacovigilance obligations
7. User-generated content (replies, comments) may need moderation/monitoring
8. Teaser content about upcoming product data IS considered advertising
`,

  contentTypeRules: `
RULES BY CONTENT TYPE:

SOCIAL POSTS:
- No prescription medicine names or indications on public-facing posts
- Hashtags must not identify specific prescription products
- Sign-offs and CTAs must not link to prescription product pages
- Disease awareness is permitted if non-promotional and not attributable to a specific product
- Personal/brand posts generally lower risk but employee posts can come in scope

BLOG ARTICLES:
- Long-form content has more room for compliance but same fundamental rules apply
- Must not be used as a vehicle for off-label promotion
- Scientific claims require proper references
- Case studies must not identify patients without consent
- If discussing treatments, must present balanced view (all available treatments)

LINKEDIN ARTICLES:
- Subject to same rules as other digital advertising
- LinkedIn is considered a professional network but still public-facing
- In Germany, prescription product content on LinkedIn is NOT permitted (cannot restrict access)
- In France, must ensure HCP-only content is on HCP-restricted platforms

PDF GUIDES:
- Detailed regulatory review required if discussing specific products
- Must include mandatory information if promotional
- Disease awareness guides must be balanced and non-promotional
- Distribution channels matter: email requires prior consent in Belgium
`,
};

// ── Review Categories ────────────────────────────────────────

export type RegulatoryFlag = "critical" | "warning" | "advisory";

export interface RegulatoryIssue {
  flag: RegulatoryFlag;
  category: "brand" | "product" | "service" | "formatting" | "claims" | "audience" | "channel";
  title: string;
  description: string;
  countries: string[];
  suggestion: string;
}

// ── Supported Languages ─────────────────────────────────────

export interface LanguageConfig {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  regulatoryCountry: string;
  spellingNotes: string;
}

export const SUPPORTED_LANGUAGES: LanguageConfig[] = [
  { code: "en", name: "English (UK)", nativeName: "English", flag: "GB", regulatoryCountry: "GB", spellingNotes: "UK spelling: organisation, colour, programme" },
  { code: "fr", name: "French", nativeName: "Francais", flag: "FR", regulatoryCountry: "FR", spellingNotes: "Formal register for healthcare content" },
  { code: "de", name: "German", nativeName: "Deutsch", flag: "DE", regulatoryCountry: "DE", spellingNotes: "Formal Sie form for professional content" },
  { code: "es", name: "Spanish", nativeName: "Espanol", flag: "ES", regulatoryCountry: "ES", spellingNotes: "European Spanish (not Latin American)" },
  { code: "it", name: "Italian", nativeName: "Italiano", flag: "IT", regulatoryCountry: "IT", spellingNotes: "Formal Lei form for professional content" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", flag: "NL", regulatoryCountry: "NL", spellingNotes: "Standard Dutch (Netherlands)" },
  { code: "pt", name: "Portuguese", nativeName: "Portugues", flag: "PT", regulatoryCountry: "PT", spellingNotes: "European Portuguese" },
  { code: "pl", name: "Polish", nativeName: "Polski", flag: "PL", regulatoryCountry: "PL", spellingNotes: "Formal register for healthcare content" },
  { code: "sv", name: "Swedish", nativeName: "Svenska", flag: "SE", regulatoryCountry: "SE", spellingNotes: "Standard Swedish" },
  { code: "da", name: "Danish", nativeName: "Dansk", flag: "DK", regulatoryCountry: "DK", spellingNotes: "Standard Danish" },
];

/**
 * Build the full regulatory context for a given set of target countries.
 * This is sent to Claude alongside the content for compliance review.
 */
export function buildRegulatoryContext(countryCodes: string[]): string {
  const sections: string[] = [UNIVERSAL_RULES.brandVsProduct, UNIVERSAL_RULES.socialMediaSpecific, UNIVERSAL_RULES.contentTypeRules];

  for (const code of countryCodes) {
    const profile = COUNTRY_PROFILES[code];
    if (!profile) continue;

    sections.push(`
${"═".repeat(60)}
${profile.name} (${profile.code}) — ${profile.regulatoryBody}
${"═".repeat(60)}

KEY LEGISLATION: ${profile.keyLegislation.join("; ")}

SOCIAL MEDIA RULES:
${profile.socialMediaRules.map((r) => `- ${r}`).join("\n")}

BRAND MENTION RULES:
${profile.brandMentionRules.map((r) => `- ${r}`).join("\n")}

PRODUCT MENTION RULES:
${profile.productMentionRules.map((r) => `- ${r}`).join("\n")}

SERVICE MENTION RULES:
${profile.serviceMentionRules.map((r) => `- ${r}`).join("\n")}

HCP ADVERTISING RULES:
${profile.hcpAdvertisingRules.map((r) => `- ${r}`).join("\n")}

ENFORCEMENT RISKS:
${profile.enforcementRisks.map((r) => `- ${r}`).join("\n")}
`);
  }

  return sections.join("\n");
}
