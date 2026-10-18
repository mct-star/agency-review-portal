"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { audiences, type AudienceId } from "./audiences";
import styles from "./process-film.module.css";

const DURATION = 24_000;
const CHAPTER = DURATION / 4;
const example = audiences.hospitality;
const chapters = [
  { label: "Your update", title: "Just say what’s happening.", summary: "A restaurant owner shares a new lunch menu, Friday music and kitchen photos." },
  { label: "Your material", title: "The good stuff is already yours.", summary: "Kitchen, lunch and live music photos become the source material for the week." },
  { label: "Your posts", title: "One business. A little variety.", summary: "The same update becomes a menu post, a music event card and a weekend reminder." },
  { label: "Your week", title: "A week to look forward to.", summary: "Three posts sit in a weekly plan with clear draft and review states. You have the final say." },
];
const photos = [
  { src: "/landing-preview/restaurant-chef.webp", alt: "Illustrative restaurant kitchen with a chef plating lunch", label: "From the kitchen" },
  { src: "/landing-preview/seasonal-lunch.webp", alt: "Illustrative seasonal lunch plate in a neighbourhood restaurant", label: "The new lunch menu" },
  { src: "/landing-preview/restaurant-music.webp", alt: "Illustrative intimate live music evening in a restaurant", label: "Friday evening" },
];
const heights = [13, 25, 17, 37, 48, 24, 55, 33, 19, 43, 60, 34, 49, 21, 38, 58, 27, 44, 19, 50, 62, 31, 45, 24, 54, 37, 18, 41, 28, 15];

function Arrow() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function Tick() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }

/** A silent, illustrative hospitality story. Controls play the animation only. */
export function ProcessFilm({ audienceId = "hospitality" }: { audienceId?: AudienceId }) {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const elapsedClock = useRef(0);
  const chapterButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const active = Math.min(3, Math.floor(elapsed / CHAPTER));
  const finished = elapsed >= DURATION;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    function update() {
      setReducedMotion(query.matches);
      if (query.matches) { setPlaying(false); elapsedClock.current = CHAPTER * 3; setElapsed(CHAPTER * 3); }
    }
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!playing || reducedMotion) return;
    let frame: number;
    const started = performance.now();
    const startingElapsed = elapsedClock.current;
    let lastRender = started;
    function advance(now: number) {
      const next = Math.min(DURATION, startingElapsed + now - started);
      elapsedClock.current = next;
      if (now - lastRender >= 100 || next >= DURATION) {
        setElapsed(next);
        lastRender = now;
      }
      if (next < DURATION) frame = requestAnimationFrame(advance);
      else setPlaying(false);
    }
    frame = requestAnimationFrame(advance);
    function onVisibility() { if (document.hidden) setPlaying(false); }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      setElapsed(elapsedClock.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [playing, reducedMotion]);

  useEffect(() => { if (finished) setPlaying(false); }, [finished]);

  function selectChapter(index: number) { elapsedClock.current = index * CHAPTER; setElapsed(index * CHAPTER); setPlaying(false); }
  function togglePlayback() {
    if (finished) { elapsedClock.current = 0; setElapsed(0); }
    setPlaying((value) => !value);
  }

  return <figure className={styles.film} data-audience={audienceId} data-playing={playing} aria-labelledby={`${id}-caption`}>
    <figcaption className={styles.caption} id={`${id}-caption`}><span><span className={styles.captionDot} />The story of a week</span><span>Illustrative hospitality example</span></figcaption>
    <div className={styles.canvas} id={`${id}-story`} style={{ "--film-progress": `${elapsed / DURATION * 100}%` } as CSSProperties}>
      <div className={styles.filmTop}><span>THE DAILY DICTATE</span><span>{String(active + 1).padStart(2, "0")} / 04</span></div>

      <section className={`${styles.scene} ${styles.voiceScene} ${active === 0 ? styles.active : ""}`} aria-hidden={active !== 0}>
        <div className={styles.sceneHeading}><span>START WITH WHAT’S REAL</span><h3>{chapters[0].title}</h3></div>
        <div className={styles.voiceComposition}>
          <div className={styles.backPhoto}><Image src={photos[0].src} alt="" fill sizes="(max-width: 640px) 110px, 320px" /></div>
          <div className={styles.voiceCard}>
            <div className={styles.noteTop}><span className={styles.voiceIcon}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.6" /><path d="M6 10v1a6 6 0 0 0 12 0v-1M12 17v4m-3 0h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></span><span>Your voice update<small>A little news from your business</small></span><span className={styles.noteDot} /></div>
            <div className={styles.waveform} aria-hidden="true">{heights.map((height, index) => <i key={index} style={{ height, "--bar-delay": `${index * -.13}s` } as CSSProperties} />)}</div>
            <blockquote>{example.source}</blockquote>
            <div className={styles.noteBottom}><span>YOUR WORDS. YOUR BUSINESS.</span><span>Voice or text <Arrow /></span></div>
          </div>
          <div className={styles.voiceAside}>No blank page.<br /><em>Just your day.</em></div>
        </div>
      </section>

      <section className={`${styles.scene} ${styles.mediaScene} ${active === 1 ? styles.active : ""}`} aria-hidden={active !== 1}>
        <div className={styles.sceneHeading}><span>ADD YOUR PHOTOS & THE DATES THAT MATTER</span><h3>{chapters[1].title}</h3></div>
        <div className={styles.mediaLibrary}>
          {photos.map((photo, index) => <div className={styles.mediaPrint} key={photo.src} style={{ "--item": index } as CSSProperties}>
            <div className={styles.mediaImage}><Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 640px) 44vw, 250px" /><span className={styles.selectedMark}><Tick /></span></div>
            <span>{photo.label}</span>
          </div>)}
        </div>
        <div className={styles.materialStrip}><span>Your update</span><i /><span>Your photos</span><i /><span>Your events</span><Arrow /></div>
        <p className={styles.mediaNote}>The things happening in your business.<br /><em>Made into something worth sharing.</em></p>
      </section>

      <section className={`${styles.scene} ${styles.postsScene} ${active === 2 ? styles.active : ""}`} aria-hidden={active !== 2}>
        <div className={styles.sceneHeading}><span>GIVE EACH POST ITS OWN PURPOSE</span><h3>{chapters[2].title}</h3></div>
        <div className={styles.postCollection}>
          <article className={`${styles.socialCard} ${styles.lunchCard}`}>
            <div className={styles.socialPhoto}><Image src={photos[1].src} alt={photos[1].alt} fill sizes="(max-width: 640px) 44vw, 250px" /><span>NEW ON THE MENU</span></div>
            <div className={styles.socialCopy}><span>{example.posts[0].format}</span><h4>{example.posts[0].title}</h4><p>A fresh reason to make a lunch date.</p><span className={styles.cardCta}>Explore the menu <Arrow /></span></div>
          </article>
          <article className={`${styles.socialCard} ${styles.musicCard}`}>
            <div className={styles.eventArtwork}><Image src={photos[2].src} alt={photos[2].alt} fill sizes="(max-width: 640px) 44vw, 250px" /><div><span>MAKE A NIGHT OF IT</span><h4>Live<br /><em>music.</em></h4><span>THIS FRIDAY</span></div></div>
            <div className={styles.eventFooter}><span>{example.posts[1].format}</span><span>Plan your Friday <Arrow /></span></div>
          </article>
          <article className={`${styles.socialCard} ${styles.weekendCard}`}>
            <div className={styles.weekendArtwork}><span>GOOD FOOD. GOOD COMPANY.</span><h4>A little <br />room for <br /><em>the weekend.</em></h4><div className={styles.weekendPhoto}><Image src={photos[0].src} alt={photos[0].alt} fill sizes="180px" /></div></div>
            <div className={styles.eventFooter}><span>{example.posts[2].format}</span><span>Book a table <Arrow /></span></div>
          </article>
        </div>
      </section>

      <section className={`${styles.scene} ${styles.planScene} ${active === 3 ? styles.active : ""}`} aria-hidden={active !== 3}>
        <div className={styles.sceneHeading}><span>A CLEAR PLAN. YOUR FINAL SAY.</span><h3>{chapters[3].title}</h3></div>
        <div className={styles.planBoard}>
          <div className={styles.planTop}><span>{example.weekTitle}</span><span>3 posts to check</span></div>
          <ol>{example.posts.map((post, index) => <li key={post.day} style={{ "--item": index } as CSSProperties}>
            <span className={styles.day}>{post.day}</span><div className={styles.planThumb}><Image src={photos[[1, 2, 0][index]].src} alt="" fill sizes="68px" /></div>
            <div className={styles.planPost}><span>{post.format}</span><h4>{post.title}</h4></div><span className={`${styles.status} ${post.status === "review" ? styles.reviewStatus : ""}`}>{post.status === "ready" ? "Ready to share" : post.status === "review" ? "For review" : "Draft"}</span>
          </li>)}</ol>
          <div className={styles.reviewBar}><span className={styles.reviewIcon}><Tick /></span><p>Check the words. Check the photos.<br /><strong>You decide what is ready.</strong></p><span className={styles.reviewBadge}>Your final say</span></div>
        </div>
      </section>
      <div className={styles.progressTrack} aria-hidden="true"><span /></div>
    </div>

    <div className={styles.controls}>
      {!reducedMotion && <button className={styles.playButton} type="button" onClick={togglePlayback} aria-controls={`${id}-story`} aria-label={playing ? "Pause illustrative product story" : finished ? "Replay illustrative product story" : "Play illustrative product story"}>
        {playing ? <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="2" width="3" height="12" rx="1" /><rect x="10" y="2" width="3" height="12" rx="1" /></svg> : <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="m4 2 10 6-10 6V2Z" /></svg>}
        <span>{playing ? "Pause" : finished ? "Replay" : elapsed === 0 ? "Play the story" : "Continue"}</span><span className={styles.duration}>24 sec</span>
      </button>}
      <div className={styles.chapters} role="group" aria-label="Product story scenes">{chapters.map((chapter, index) => <button type="button" key={chapter.label} ref={(node) => { chapterButtons.current[index] = node; }} aria-label={`Show scene ${index + 1}: ${chapter.label}`} aria-pressed={active === index} onClick={() => selectChapter(index)} onKeyDown={(event) => {
        let next: number | null = null;
        if (event.key === "ArrowRight") next = (index + 1) % chapters.length;
        if (event.key === "ArrowLeft") next = (index + chapters.length - 1) % chapters.length;
        if (next !== null) { event.preventDefault(); selectChapter(next); chapterButtons.current[next]?.focus(); }
      }}><span>{String(index + 1).padStart(2, "0")}</span><span>{chapter.label}</span></button>)}</div>
    </div>
    <p className={styles.disclosure}>An illustrative product story with AI-generated example photos. Silent preview. Playback does not record, create or approve content.</p>
    <p className={styles.srOnly} aria-live="polite">Scene {active + 1}: {chapters[active].summary}</p>
  </figure>;
}
