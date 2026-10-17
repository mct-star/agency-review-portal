/**
 * Public hero and first-section preview for Michael's design review. Audience
 * links personalise this illustration without changing the live platform.
 */
import type { Metadata } from "next";
import localFont from "next/font/local";
import LandingExperience from "./LandingExperience";
import { parseAudience } from "./audiences";
import styles from "./preview.module.css";

const jost = localFont({ src: "../../../public/landing-preview/Jost-variable-latin.woff2", variable: "--preview-font-sans", weight: "100 900", display: "swap" });
const baskerville = localFont({ src: "../../../public/landing-preview/LibreBaskerville-Italic-latin.woff2", variable: "--preview-font-serif", weight: "400", style: "italic", display: "swap" });
const description = "SocialTempo helps businesses turn their updates into planned social content for review and sharing.";

export const metadata: Metadata = {
  title: { absolute: "SocialTempo | Design preview" },
  description,
  robots: { index: false, follow: false },
  icons: { icon: { url: "/landing-preview/content-mark.svg", type: "image/svg+xml" }, shortcut: "/landing-preview/content-mark.svg" },
  openGraph: { title: "SocialTempo | Design preview", siteName: "SocialTempo", description, url: "/landing-preview" },
  twitter: { title: "SocialTempo | Design preview", description },
};

export default async function LandingPreviewPage({ searchParams }: { searchParams: Promise<{ audience?: string | string[] }> }) {
  const { audience } = await searchParams;
  return <div className={`${styles.page} ${jost.variable} ${baskerville.variable}`}><LandingExperience initialAudience={parseAudience(audience)} /></div>;
}
