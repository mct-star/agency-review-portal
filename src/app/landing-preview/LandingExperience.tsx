"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ContentFlow, { WeekProgramme } from "./ContentFlow";
import { ProcessFilm } from "./ProcessFilm";
import { audienceIds, audiences, parseAudience, platformUrl, signupUrlForAudience, type AudienceId } from "./audiences";
import styles from "./preview.module.css";
import Image from "next/image";

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
        <a href="#product-story" className={styles.howNav}>See the story</a>
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
            <p className={styles.heroProcess}>Speak updates on your phone or laptop. Add your photos, events or offers, then review a varied week of drafts.</p>
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
      <section id="product-story" className={styles.filmSection} aria-labelledby="film-heading">
        <div className={styles.filmIntro}>
          <p className={styles.sectionEyebrow}>A WEEK, TAKING SHAPE</p>
          <h2 id="film-heading">Say what’s happening.<br /><em>See a week take shape.</em></h2>
          <p>A new menu. Friday music. A moment from the kitchen. See how one restaurant update becomes a varied set of posts to review.</p>
        </div>
        <ProcessFilm audienceId={audienceId} />
      </section>
      <section className={styles.editorialSection} aria-labelledby="formats-heading">
        <div className={styles.editorialCopy}>
          <p className={styles.sectionEyebrow}>ONE UPDATE, MORE TO WORK WITH</p>
          <h2 id="formats-heading">One update.<br /><em>More than one kind of post.</em></h2>
          <p>Pair your updates with your photo library. Create a short post, a carousel or a story with a clear role in the week. Choose the formats that fit, then make the final edits.</p>
          <span className={styles.illustrativeLabel}>A restaurant update, shown across three example formats.</span>
        </div>
        <div className={styles.formatShowcase}>
          <div className={styles.mediaCard}>
            <Image src="/landing-preview/restaurant-chef.webp" alt="A chef preparing a dish in a restaurant kitchen" width={900} height={1100} sizes="(max-width: 780px) 86vw, 38vw" />
            <span>YOUR PHOTO LIBRARY</span>
            <strong>A moment worth sharing</strong>
          </div>
          <div className={styles.formatStack}>
            <article className={styles.postMock}>
              <div className={styles.postMockBar}><span>01 / SHORT POST</span></div>
              <div className={styles.shortPostBody}><Image src="/landing-preview/seasonal-lunch.webp" alt="" width={160} height={160} /><div><strong>Lunch just got a little brighter.</strong><p>A new seasonal menu, made for a slower midday.</p><b>Explore the menu ↗</b></div></div>
            </article>
            <article className={`${styles.postMock} ${styles.carouselMock}`}>
              <div className={styles.postMockBar}><span>02 / CAROUSEL COVER</span></div>
              <div className={styles.carouselCover}><Image src="/landing-preview/restaurant-chef.webp" alt="" fill sizes="(max-width: 780px) 70vw, 30vw" /><span>FROM THE KITCHEN</span><strong>What makes a<br />good lunch break?</strong><i>Swipe to explore</i></div>
            </article>
            <article className={`${styles.postMock} ${styles.quoteMock}`}>
              <div className={styles.postMockBar}><span>03 / STORY POST</span></div>
              <div className={styles.quotePost}><span>THIS WEEK AT OUR PLACE</span><strong>Good food.<br />Live music.<br /><em>A reason to stay.</em></strong><p>Friday evening, at your own pace.</p></div>
            </article>
          </div>
        </div>
      </section>
      <section className={styles.eventSection} aria-labelledby="event-heading">
        <div className={styles.eventVisual}>
          <Image src="/landing-preview/seasonal-lunch.webp" alt="A seasonal lunch prepared with fresh ingredients" width={1100} height={800} sizes="(max-width: 780px) 100vw, 48vw" />
          <div className={styles.eventCard}><span>WHAT’S ON / ILLUSTRATIVE</span><strong>A seasonal menu, this Friday</strong><p>Good food, a date to remember and a clear next step.</p><b>Reserve your place <span aria-hidden="true">↗</span></b></div>
        </div>
        <div className={styles.eventCopy}>
          <p className={styles.sectionEyebrow}>MAKE THE NEXT STEP CLEAR</p>
          <h2 id="event-heading">Your next event.<br /><em>A reason to get in touch.</em></h2>
          <p>Bring your events and offers into the plan. Turn the key details into timely draft posts and clear calls to action, ready for you to check.</p>
          <p className={styles.smallQualification}>Example CTA shown for illustration. Add the correct date, terms and booking details to your brief.</p>
        </div>
      </section>
      <section className={styles.planningSection} aria-labelledby="planning-heading">
        <div className={styles.planningIntro}>
          <p className={styles.sectionEyebrow}>A WIDER VIEW</p>
          <h2 id="planning-heading">Plan the month.<br /><em>Create a week at a time.</em></h2>
          <p>Give your ideas a place in the month, then turn the next batch into drafts. See the mix of topics, events and offers together before you review.</p>
        </div>
        <div className={styles.calendarMock} aria-label="Illustrative monthly content plan">
          <div className={styles.calendarHeader}><span>PLANNING VIEW</span><strong>Your next four weeks</strong><span>Illustrative</span></div>
          <div className={styles.calendarDays}><span aria-hidden="true" />{["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className={styles.calendarWeeks}>
            {[
              { label: "WEEK 01", slots: ["Tip", "", "Photo", "Event", "Post", "Offer", ""] },
              { label: "WEEK 02", slots: ["Story", "Post", "", "Tip", "Photo", "", "Event"] },
              { label: "WEEK 03", slots: ["", "Offer", "Post", "Photo", "", "Event", "Story"] },
              { label: "WEEK 04", slots: ["Post", "Tip", "Photo", "", "Event", "Story", "Offer"] },
            ].map((week) => <div className={styles.calendarWeek} key={week.label}><span className={styles.weekLabel}>{week.label}</span>{week.slots.map((slot, index) => <span key={`${week.label}-${index}`} className={`${styles.calendarSlot} ${slot ? styles.calendarSlotFilled : ""}`} aria-label={`${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][index]}: ${slot || "Open slot"}`}>{slot}</span>)}</div>)}
          </div>
          <p className={styles.calendarNote}>Illustrative mix of posts, events and offers.</p>
        </div>
      </section>
      <section className={styles.reviewSection} aria-labelledby="review-heading">
        <div className={styles.reviewPhoto}>
          <Image src="/landing-preview/restaurant-music.webp" alt="A live music evening at a neighbourhood restaurant" width={1000} height={1200} sizes="(max-width: 780px) 100vw, 42vw" />
          <span>YOUR BUSINESS. YOUR FINAL SAY.</span>
        </div>
        <div className={styles.reviewStory}>
          <p className={styles.sectionEyebrow}>KEEP THE HUMAN EYE ON IT</p>
          <h2 id="review-heading">A good draft is a start.<br /><em>Your review makes it yours.</em></h2>
          <p>Check the words, images, dates and next step together. Make changes, leave a draft for later or approve what is ready to share.</p>
          <div className={styles.reviewChecklist}><span>Check the detail</span><span>Make it sound like you</span><span>Approve before sharing</span></div>
          <p className={styles.smallQualification}>For regulated work, AI-assisted checks can help flag sentence-level concerns. A qualified human reviewer remains responsible for approval.</p>
        </div>
      </section>
      <section className={styles.faqSection} aria-labelledby="faq-heading">
        <div className={styles.faqIntro}><p className={styles.sectionEyebrow}>A FEW USEFUL ANSWERS</p><h2 id="faq-heading">Before you begin.</h2></div>
        <div className={styles.faqList}>
          <details><summary>Do I need to record something every day?</summary><p>No. Talk through what is happening when it suits you, then review the drafts prepared from your updates.</p></details>
          <details><summary>What happens after I approve a post?</summary><p>Export your approved content for scheduling. You choose which drafts are ready to share. Nothing is published from this design preview.</p></details>
          <details><summary>Can I plan a whole month at once?</summary><p>You can organise content slots in a month view. A slot is a plan, not a finished post, so full drafts are created and reviewed separately.</p></details>
          <details><summary>Can I use my own photos and event details?</summary><p>Yes. Bring your own media and the details that matter. Check each draft for accuracy before approving it.</p></details>
          <details><summary>Can I use it for client work?</summary><p>Yes. Keep each client’s strategy, voice and assets in their own workspace, with a connected programme of posts to review.</p></details>
          <details><summary>What about regulated content?</summary><p>AI-assisted checks flag sentence-level concerns and suggest edits. Review drafts against your approved messages and policies. A qualified human reviewer remains responsible for approval.</p></details>
        </div>
      </section>
      <section className={styles.finalCta} aria-labelledby="final-cta-heading">
        <div><p className={styles.sectionEyebrow}>MAKE ROOM FOR THE WORK ONLY YOU CAN DO</p><h2 id="final-cta-heading">Talk through the week.<br /><em>Then get back to it.</em></h2></div>
        <Link href={signupUrl} className={styles.primaryCta}>Get started<Arrow diagonal /></Link>
      </section>
    </main>
    <footer className={styles.previewFooter}>
      <div className={styles.conceptMeta}><span>The Daily Dictate | Design preview</span><span className={styles.conceptOrigin}>A product concept by AGENCY Bristol</span></div>
      <nav className={styles.footerNavigation} aria-label="Footer navigation"><a href="#how-it-works">How it works</a><a href="#example-week">Example week</a><Link href={platformUrl}>Current platform<Arrow /></Link></nav>
    </footer>
  </>;
}
