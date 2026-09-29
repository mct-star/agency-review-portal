/**
 * Whether a company's industry counts as healthcare for the content
 * intelligence layer (day rules, healthcare specificity gates). Until
 * 29 Sept 2026 the blog writer hard-coded this to true for every company,
 * regardless of what the company actually did.
 *
 * A loose, case-insensitive substring match, so "Healthcare", "Healthcare /
 * Life Sciences", "Pharmaceuticals / Medical Devices", "MedTech" and
 * "Private Clinic Group" all match.
 */
const HEALTHCARE_INDUSTRY_TERMS = ["health", "medic", "pharma", "clinic", "life science", "medtech"];

export function isHealthcareIndustry(industry: string | null | undefined): boolean {
  if (!industry) return false;
  const lower = industry.toLowerCase();
  return HEALTHCARE_INDUSTRY_TERMS.some((term) => lower.includes(term));
}
