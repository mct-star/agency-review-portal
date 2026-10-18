"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ContentFlow, { WeekProgramme } from "./ContentFlow";
import { audienceIds, audiences, parseAudience, platformUrl, signupUrlForAudience, type AudienceId } from "./audiences";
import styles from "./preview.module.css";

function ContentMark() {
  return <svg aria-hidden="true" width="26" height="26" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="7" fill="#A27BF9" /><path d="M9 10h14M9 16h14M9 22h8" stroke="#1D2021" strokeWidth="2" strokeLinecap="round" /></svg>;
}
function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d={diagonal ? "M6 18 18 6M6 6h12v12" : "M4 12h15m-6-6 6 6-6 6"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function LandingExperience({ initialAudience }: { initialAudience: AudienceId }) {
  const [audienceId, setAudienceId] = useState(initialAudience);
  const audience = audiences[audienceId];
  const signupUrl = signupUrlForAudience(audienceId);

  useEffect(() => {
    const syncAudience = () => setAudienceId(parseAudience(new URL(window.location.href).searchParams.get("audience")));
    window.addEventListener("popstate", syncAudience);
    return () => window.removeEventListener("popstate", syncAudience);
  }, []);

  function selectAudience(id: AudienceId) {
    setAudienceId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("audience", id);
    window.history.replaceState(null, "", url);
  }

  return <>
    <header className={styles.header}>
      <a href="#top" className={styles.brand} aria-label="The Daily Dictate, back to top"><ContentMark /><span className={styles.wordmark}>The Daily <span className={styles.wordmarkBreak}>Dictate</span></span></a>
      <nav className={styles.navigation} aria-label="Main navigation">
        <a href="#how-it-works" className={styles.howNav}>How it works</a>
        <Link href={`${platformUrl}/login`} className={styles.login}>Log in</Link>
        <Link href={signupUrl} className={styles.headerCta}>Get started<Arrow diagonal /></Link>
      </nav>
    </header>
    <main id="top">
      <section className={styles.hero} aria-labelledby="hero-heading">
        <div className={styles.audienceBar}>
          <p id="audience-label">MADE FOR YOUR BUSINESS</p>
          <div className={styles.audienceOptions} role="group" aria-labelledby="audience-label">
            {audienceIds.map((id) => <button key={id} type="button" aria-pressed={id === audienceId} onClick={() => selectAudience(id)} className={`${styles.audienceButton} ${id === audienceId ? styles.audienceActive : ""}`}>{audiences[id].label}</button>)}
          </div>
          <div className={styles.mobileAudience}>
            <label htmlFor="audience-select">Your business</label>
            <select id="audience-select" value={audienceId} onChange={(event) => selectAudience(parseAudience(event.target.value))}>
              {audienceIds.map((id) => <option key={id} value={id}>{audiences[id].label}</option>)}
            </select>
          </div>
        </div>
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <h1 id="hero-heading">Talk through<br />your week.<br /><em>Get social posts</em><br /><em>to review.</em></h1>
            <p className={styles.pocketLine}>Keep posting. Get on with your business.</p>
            <p className={styles.heroDescription}>{audience.description}</p>
            <p className={styles.heroProcess}>Speak updates on your phone or laptop. Add photos, events or offers, then review a varied week of drafts.</p>
            <div className={styles.heroActions}>
              <a href="#example-week" className={styles.primaryCta}>See an example week<Arrow /></a>
              <Link href={signupUrl} className={styles.secondaryCta}>Get started<Arrow diagonal /></Link>
            </div>
            <p className={styles.heroFootnote}>You decide what is ready to share.</p>
          </div>
          <figure id="example-week" className={styles.workspaceFigure} aria-label={`Illustrative ${audience.label.toLowerCase()} content week`}>
            <figcaption className={styles.workspaceCaption}><span />Illustrative example</figcaption>
            <div className={styles.workspace}>
              <div className={styles.workspaceTop}><ContentMark /><span>Your content week</span><span className={styles.workspaceTopLabel}>SPEAK / CREATE / REVIEW</span></div>
              <div className={styles.workspaceContent}>
                <div className={styles.workspaceHeading}><span>{audience.label}</span><h2>{audience.weekTitle}</h2></div>
                <div className={styles.inputNote}>
                  <span className={styles.inputNoteLabel}><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM6 10v2a6 6 0 0 0 12 0v-2M12 18v3m-3 0h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>{audience.sourceLabel}</span>
                  <p>{audience.source}</p>
                </div>
                <WeekProgramme audience={audience} />
                <p className={styles.weekNote}>{audience.weekNote}</p>
              </div>
            </div>
            <span className={styles.canvasAccent} aria-hidden="true" />
          </figure>
        </div>
        <p className={styles.srOnly} role="status">Showing the {audience.label.toLowerCase()} example.</p>
      </section>
      <section id="how-it-works" className={styles.flowSection} aria-labelledby="flow-heading">
        <div className={styles.flowInner}>
          <div className={styles.flowIntro}>
            <p className={styles.flowEyebrow}>FROM YOUR UPDATES TO A WEEK THAT WORKS</p>
            <h2 id="flow-heading">{audience.sectionTitle}<br /><em>{audience.sectionEmphasis}</em></h2>
            <p>{audience.sectionDescription}</p>
          </div>
          <ContentFlow audience={audience} audienceId={audienceId} />
        </div>
      </section>
    </main>
    <footer className={styles.previewFooter}>
      <div className={styles.conceptMeta}><span>The Daily Dictate | Design preview</span><span className={styles.conceptOrigin}>A product concept by AGENCY Bristol</span></div>
      <Link href={platformUrl}>View current site<Arrow /></Link>
    </footer>
  </>;
}
