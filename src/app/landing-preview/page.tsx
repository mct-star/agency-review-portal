/**
 * Public design preview for Michael to review the proposed content platform
 * hero and first section without replacing the current marketing pages.
 */
import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import ContentFlow from "./ContentFlow";
import styles from "./preview.module.css";

const platformUrl = "https://agency-review-portal.vercel.app";

const jost = localFont({
  src: "../../../public/landing-preview/Jost-variable-latin.woff2",
  variable: "--preview-font-sans",
  weight: "100 900",
  display: "swap",
});

const baskerville = localFont({
  src: "../../../public/landing-preview/LibreBaskerville-Italic-latin.woff2",
  variable: "--preview-font-serif",
  weight: "400",
  style: "italic",
  display: "swap",
});

export const metadata: Metadata = {
  title: { absolute: "Pointwoven | Brand concept" },
  description: "A working brand concept for a content platform that helps businesses plan, write and review in their own voice.",
  robots: { index: false, follow: false },
  icons: {
    icon: { url: "/landing-preview/pointwoven-mark.svg", type: "image/svg+xml" },
    shortcut: "/landing-preview/pointwoven-mark.svg",
  },
  openGraph: {
    title: "Pointwoven | Brand concept",
    siteName: "Pointwoven",
    description: "A working brand concept for a content platform that helps businesses plan, write and review in their own voice.",
    url: "/landing-preview",
  },
  twitter: {
    title: "Pointwoven | Brand concept",
    description: "A working brand concept for a content platform that helps businesses plan, write and review in their own voice.",
  },
};

function PointwovenMark() {
  return (
    <svg aria-hidden="true" width="28" height="28" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="7" fill="#A27BF9" />
      <path d="M9 8h6.6c4.2 0 7 2.6 7 6.1S19.8 20 15.6 20h-3.4v5H9V8Zm3.2 3v6h3.1c2.4 0 3.9-1.1 3.9-3s-1.5-3-3.9-3h-3.1Z" fill="#1D2021" fillRule="evenodd" />
    </svg>
  );
}

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d={diagonal ? "M6 18 18 6M6 6h12v12" : "M4 12h15m-6-6 6 6-6 6"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WorkspaceIcon({ kind }: { kind: "create" | "review" | "calendar" }) {
  const paths = {
    create: "M12 20h8M15.5 3.5l5 5M4 15 16.5 2.5a1.4 1.4 0 0 1 2 0l3 3a1.4 1.4 0 0 1 0 2L9 20l-6 1 1-6Z",
    review: "m7 12 3 3 7-7M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
    calendar: "M8 2v5m8-5v5M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  };
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d={paths[kind]} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function WorkspacePreview() {
  return (
    <figure className={styles.workspaceFigure} aria-label="Illustrative content workspace showing a thought turned into a draft for review">
      <figcaption className={styles.workspaceCaption}><span className={styles.liveDot} />Illustrative workspace</figcaption>
      <div className={styles.workspace}>
        <div className={styles.workspaceTop}>
          <span className={styles.workspaceMark}><PointwovenMark /></span>
          <span>Your content workspace</span>
          <span className={styles.workspaceTopDot} aria-hidden="true" />
        </div>
        <div className={styles.workspaceBody}>
          <div className={styles.workspaceRail} aria-hidden="true">
            <div className={styles.railActive}><WorkspaceIcon kind="create" /><span>Create</span></div>
            <div><WorkspaceIcon kind="review" /><span>Review</span></div>
            <div><WorkspaceIcon kind="calendar" /><span>Calendar</span></div>
            <span className={styles.railFoot}>Your voice.<br />Your call.</span>
          </div>
          <div className={styles.workspaceDocument}>
            <div className={styles.documentMeta}><span>YOUR NEXT POST</span><span className={styles.reviewStatus}>For your review</span></div>
            <h2>The best content starts<br />with a real thought.</h2>
            <p>You don’t need another content idea. Start with the question you answered in your last meeting.</p>
            <p>Someone else is asking the same thing.</p>
            <div className={styles.documentBottom}>
              <div className={styles.quotePreview}>
                <span>ONE THOUGHT, WORTH SHARING</span>
                <p>Your expertise.<br /><em>Their next step.</em></p>
                <span className={styles.quoteBrand}>Your business</span>
              </div>
              <div className={styles.draftNote}>
                <span className={styles.noteIcon}><WorkspaceIcon kind="review" /></span>
                <strong>A draft.<br />Ready for your eye.</strong>
                <p>Edit the words.<br />Make it yours.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.sourceNote}>
        <div className={styles.sourceNoteTop}><span className={styles.voiceIcon} aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM6 10v2a6 6 0 0 0 12 0v-2M12 18v3m-3 0h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></span><span>It starts with your thought</span></div>
        <p>“I answered a question in a meeting today. I think more people need to hear the answer.”</p>
      </div>
      <span className={styles.canvasAccent} aria-hidden="true" />
    </figure>
  );
}

export default function LandingPreviewPage() {
  return (
    <div className={`${styles.page} ${jost.variable} ${baskerville.variable}`}>
      <header className={styles.header}>
        <a href="#top" className={styles.brand} aria-label="Pointwoven content platform, back to top">
          <span className={styles.wordmark}>pointwoven<span className={styles.wordmarkPoint} aria-hidden="true" /></span>
          <span className={styles.brandLabel}>Content platform</span>
        </a>
        <nav className={styles.navigation} aria-label="Main navigation">
          <a href="#how-it-works" className={styles.howNav}>How it works</a>
          <Link href={`${platformUrl}/login`} className={styles.login}>Log in</Link>
          <Link href={`${platformUrl}/signup`} className={styles.headerCta}>Get started<Arrow diagonal /></Link>
        </nav>
      </header>

      <main id="top">
        <section className={styles.hero} aria-labelledby="hero-heading">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><span />YOUR BUSINESS. YOUR VOICE.</p>
            <h1 id="hero-heading">Your expertise.<br />Unmistakably<br /> <em>you.</em></h1>
            <p className={styles.heroDescription}>Plan, write and review content in your own voice, with you in control of what gets published.</p>
            <div className={styles.heroActions}>
              <Link href={`${platformUrl}/signup`} className={styles.primaryCta}>Get started<Arrow diagonal /></Link>
              <a href="#how-it-works" className={styles.secondaryCta}>See how it works<Arrow /></a>
            </div>
            <p className={styles.heroFootnote}>Your thinking, given a place to go.</p>
          </div>
          <WorkspacePreview />
        </section>

        <section id="how-it-works" className={styles.flowSection} aria-labelledby="flow-heading">
          <div className={styles.flowInner}>
            <div className={styles.flowIntro}>
              <p className={styles.flowEyebrow}>FROM A THOUGHT TO SOMETHING WORTH SHARING</p>
              <h2 id="flow-heading">Less blank page.<br /> <em>More you.</em></h2>
              <p>Start with what you know. Shape it into content. Keep the final say.</p>
            </div>
            <ContentFlow />
          </div>
        </section>
      </main>

      <footer className={styles.previewFooter}>
        <div className={styles.conceptMeta}>
          <span>Pointwoven | Brand concept</span>
          <span className={styles.conceptOrigin}>A product concept by AGENCY Bristol</span>
        </div>
        <Link href={platformUrl}>View current site<Arrow /></Link>
      </footer>
    </div>
  );
}
