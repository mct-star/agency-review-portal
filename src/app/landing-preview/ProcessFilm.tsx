"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { audiences, type AudienceId } from "./audiences";
import { SocialPostPreview } from "./SocialPostPreview";
import styles from "./process-film.module.css";

const DURATION = 24_000;
const CHAPTER = DURATION / 4;
const chapterLabels = ["Your update", "Your material", "Your posts", "Your week"];
const photos = [
  { src: "/landing-preview/restaurant-chef.webp", alt: "Illustrative restaurant kitchen with a chef plating lunch", label: "From the kitchen" },
  { src: "/landing-preview/seasonal-lunch.webp", alt: "Illustrative seasonal lunch plate in a neighbourhood restaurant", label: "The new lunch menu" },
  { src: "/landing-preview/restaurant-music.webp", alt: "Illustrative intimate live music evening in a restaurant", label: "Friday evening" },
];
const heights = [13, 25, 17, 37, 48, 24, 55, 33, 19, 43, 60, 34, 49, 21, 38, 58, 27, 44, 19, 50, 62, 31, 45, 24, 54, 37, 18, 41, 28, 15];

function Arrow() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function Tick() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }

/** A silent, illustrative audience-aware story. Controls play the animation only. */
export function ProcessFilm({ audienceId = "hospitality" }: { audienceId?: AudienceId }) {
  const audience = audiences[audienceId];
  const chapters = [
    { label: chapterLabels[0], title: "Start with what matters to you.", summary: audience.sourceSummary },
    { label: chapterLabels[1], title: "Bring the context you already have.", summary: audience.inputs.join(", ") },
    { label: chapterLabels[2], title: "Give each post its own purpose.", summary: audience.socialPosts[0].caption },
    { label: chapterLabels[3], title: "A week to review in one view.", summary: audience.weekNote },
  ];
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
    <figcaption className={styles.caption} id={`${id}-caption`}><span><span className={styles.captionDot} />The story of a week</span><span>Illustrative {audience.label.toLowerCase()} example</span></figcaption>
    <div className={styles.canvas} id={`${id}-story`} style={{ "--film-progress": `${elapsed / DURATION * 100}%` } as CSSProperties}>
      <div className={styles.filmTop}><span>THE DAILY DICTATE</span><span>{String(active + 1).padStart(2, "0")} / 04</span></div>

      <section className={`${styles.scene} ${styles.voiceScene} ${active === 0 ? styles.active : ""}`} aria-hidden={active !== 0} inert={active !== 0}>
        <div className={styles.sceneHeading}><span>START WITH WHAT’S REAL</span><h3>{chapters[0].title}</h3></div>
        <div className={styles.voiceComposition}>
          {audienceId === "hospitality" ? <div className={styles.backPhoto}><Image src={photos[0].src} alt="" fill sizes="(max-width: 640px) 110px, 320px" /></div> : <div className={styles.contextTile}><span>{audience.inputs[0]}</span><strong>{audience.posts[0].title}</strong></div>}
          <div className={styles.voiceCard}>
            <div className={styles.noteTop}><span className={styles.voiceIcon}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.6" /><path d="M6 10v1a6 6 0 0 0 12 0v-1M12 17v4m-3 0h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></span><span>Your voice update<small>A little news from your business</small></span><span className={styles.noteDot} /></div>
            <div className={styles.waveform} aria-hidden="true">{heights.map((height, index) => <i key={index} style={{ height, "--bar-delay": `${index * -.13}s` } as CSSProperties} />)}</div>
            <blockquote>{audience.source}</blockquote>
            <div className={styles.noteBottom}><span>YOUR WORDS. YOUR BUSINESS.</span><span>Voice or text <Arrow /></span></div>
          </div>
          <div className={styles.voiceAside}>A clear starting point.<br /><em>From what matters to you.</em></div>
        </div>
      </section>

      <section className={`${styles.scene} ${styles.mediaScene} ${active === 1 ? styles.active : ""}`} aria-hidden={active !== 1} inert={active !== 1}>
        <div className={styles.sceneHeading}><span>{audienceId === "hospitality" ? "ADD YOUR PHOTOS & THE DATES THAT MATTER" : "ADD THE CONTEXT THAT MATTERS"}</span><h3>{chapters[1].title}</h3></div>
        {audienceId === "hospitality" ? <div className={styles.mediaLibrary}>
          {photos.map((photo, index) => <div className={styles.mediaPrint} key={photo.src} style={{ "--item": index } as CSSProperties}>
            <div className={styles.mediaImage}><Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 640px) 44vw, 250px" /><span className={styles.selectedMark}><Tick /></span></div>
            <span>{photo.label}</span>
          </div>)}
        </div> : <div className={styles.audienceMaterials}><p>{audience.sourceSummary}</p><ul>{audience.inputs.map((input) => <li key={input}>{input}</li>)}</ul></div>}
        <div className={styles.materialStrip}>{audience.inputs.map((input, index) => <span className={styles.materialItem} key={input}>{index > 0 && <i aria-hidden="true" />}<span>{input}</span></span>)}</div>
        <p className={styles.mediaNote}>Start with the context you know.<br /><em>Then shape the week around it.</em></p>
      </section>

      <section className={`${styles.scene} ${styles.postsScene} ${active === 2 ? styles.active : ""}`} aria-hidden={active !== 2} inert={active !== 2}>
        <div className={styles.sceneHeading}><span>GIVE EACH POST ITS OWN PURPOSE</span><h3>{chapters[2].title}</h3></div>
        <div className={styles.postsPreview}><SocialPostPreview key={audienceId} audienceId={audienceId} compact /></div>
      </section>

      <section className={`${styles.scene} ${styles.planScene} ${active === 3 ? styles.active : ""}`} aria-hidden={active !== 3} inert={active !== 3}>
        <div className={styles.sceneHeading}><span>A CLEAR PLAN. YOUR FINAL SAY.</span><h3>{chapters[3].title}</h3></div>
        <div className={styles.planBoard}>
          <div className={styles.planTop}><span>{audience.weekTitle}</span><span>3 posts to check</span></div>
          <ol>{audience.posts.map((post, index) => <li key={post.day} style={{ "--item": index } as CSSProperties}>
            <span className={styles.day}>{post.day}</span><div className={styles.planThumb}>{post.image ? <Image src={post.image} alt="" fill sizes="68px" /> : <span>{post.format}</span>}</div>
            <div className={styles.planPost}><span>{post.format}</span><h4>{post.title}</h4></div><span className={`${styles.status} ${post.status === "review" ? styles.reviewStatus : ""}`}>{post.status === "ready" ? "Ready to share" : post.status === "review" ? "For review" : "Draft"}</span>
          </li>)}</ol>
          <div className={styles.reviewBar}><span className={styles.reviewIcon}><Tick /></span><p>Check the words. Check the details.<br /><strong>You decide what is ready.</strong></p><span className={styles.reviewBadge}>Your final say</span></div>
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
    <p className={styles.disclosure}>{audienceId === "hospitality" ? "Illustrative product story with example restaurant photos." : "Illustrative product story with example content graphics."} Silent preview. Playback does not record, create or approve content.</p>
    <p className={styles.srOnly} aria-live="polite">Scene {active + 1}: {chapters[active].summary}</p>
  </figure>;
}
