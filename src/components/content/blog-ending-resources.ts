/**
 * Mirrors EDITORIAL_RESOURCES in the agency-website repo
 * (src/lib/editorial-resources.ts, origin/main, 19 Nov 2026): the four
 * resource tiles every blog post ends with. Copy, order and image paths are
 * the website's; links and images are made absolute because the portal is a
 * different origin. Change the website file first, then this one.
 */
const WEBSITE_ORIGIN = "https://www.agencymedicalmarketing.com";

const SOURCE = [
  {
    id: "trust-targeting",
    tag: "NHS account intelligence",
    title: "NHS Trust Intelligence",
    body: "See which NHS trusts fit your product, using their stated priorities and the evidence behind each match.",
    cta: "Explore NHS Trust Intelligence",
    href: "https://trusts.agencymedicalmarketing.com/",
    shareImage: "/images/resources/nhs-trust-social.png",
  },
  {
    id: "assessments",
    tag: "Free marketing diagnostics",
    title: "Marketing & launch readiness",
    body: "Diagnose a product launch and get three tests to run, or score your marketing department and get 30-day actions. The emailed report is optional.",
    cta: "Find your marketing gaps",
    href: "/assessments",
    shareImage: "/images/resources/marketing-launch-readiness-social.png",
  },
  {
    id: "snake-oil-and-ladders",
    tag: "Test your campaign thinking",
    title: "Snake Oil & Ladders",
    body: "Work through the decisions behind a compliant healthcare campaign. See where your approach moves forward or gets stuck.",
    cta: "Play Snake Oil & Ladders",
    href: "/tools/snake-oil-and-ladders",
    shareImage: "/images/resources/snake-oil-social.png",
  },
  {
    id: "book",
    tag: "Understand the demand gap",
    title: "It’s Not a Sales Problem",
    body: "Explore why good healthcare products struggle to reach the people who need them, and how to build demand. Read three free chapters.",
    cta: "Read three free chapters",
    href: "/book",
    shareImage: "/images/resources/book-social.png",
  },
] as const;

const absolute = (path: string) => (path.startsWith("http") ? path : `${WEBSITE_ORIGIN}${path}`);

export const BLOG_ENDING_RESOURCES = SOURCE.map(r => ({
  ...r,
  href: absolute(r.href),
  shareImage: absolute(r.shareImage),
}));
