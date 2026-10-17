"use client";

import { useRef, useState } from "react";
import type { Audience, AudienceId, PostStatus } from "./audiences";
import styles from "./preview.module.css";

const statuses: Record<PostStatus, string> = { ready: "Ready to share", review: "For review", draft: "Draft" };
const stages = [
  { id: "source", number: "01", label: "Your updates" },
  { id: "week", number: "02", label: "A planned week" },
  { id: "review", number: "03", label: "Your approval" },
] as const;

export function WeekProgramme({ audience, compact = false }: { audience: Audience; compact?: boolean }) {
  return <ul className={`${styles.weekProgramme} ${compact ? styles.weekCompact : ""}`} aria-label="Illustrative weekly content plan">
    {audience.posts.map((post, index) => <li className={styles.weekItem} key={post.day}>
      <span className={styles.dayBadge}>{post.day}</span>
      <div className={`${styles.assetThumbnail} ${styles[`assetTone${index}`]}`} aria-hidden="true"><span>{post.asset === "Photo + caption" ? "YOUR" : "A NEW"}</span><strong>{post.asset === "Photo + caption" ? "photos." : "idea."}</strong></div>
      <div className={styles.postDetails}><h3>{post.title}</h3><p>{post.format}<span aria-hidden="true"> · </span>{post.asset}</p><span className={`${styles.postStatus} ${styles[`status${post.status}`]}`}><span aria-hidden="true" />{statuses[post.status]}</span></div>
    </li>)}
  </ul>;
}

export default function ContentFlow({ audience, audienceId }: { audience: Audience; audienceId: AudienceId }) {
  const [activeStage, setActiveStage] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  function moveTo(index: number) { setActiveStage(index); tabs.current[index]?.focus(); }

  return <div className={styles.flowDemo}>
    <div className={styles.flowTabs} role="tablist" aria-label="Explore a content week">
      {stages.map((stage, index) => <button key={stage.id} ref={(element) => { tabs.current[index] = element; }} id={`flow-tab-${stage.id}`} type="button" role="tab" aria-selected={index === activeStage} aria-controls={`flow-panel-${stage.id}`} tabIndex={index === activeStage ? 0 : -1} className={`${styles.flowTab} ${index === activeStage ? styles.flowTabActive : ""}`} onClick={() => setActiveStage(index)} onKeyDown={(event) => {
        let next: number | null = null;
        if (event.key === "ArrowRight") next = (index + 1) % stages.length;
        if (event.key === "ArrowLeft") next = (index - 1 + stages.length) % stages.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = stages.length - 1;
        if (next !== null) { event.preventDefault(); moveTo(next); }
      }}><span className={styles.flowNumber}>{stage.number}</span><span>{stage.label}</span></button>)}
    </div>
    {stages.map((stage, index) => <div key={stage.id} className={styles.flowPanel} id={`flow-panel-${stage.id}`} role="tabpanel" aria-labelledby={`flow-tab-${stage.id}`} hidden={index !== activeStage} tabIndex={0}>
      <div className={styles.flowPanelHeading}><span>ILLUSTRATIVE EXAMPLE</span><span>{stage.number} / 03</span></div>
      {stage.id === "source" && <div className={styles.sourceExample}>
        <p className={styles.flowSummary}>{audience.sourceSummary}</p>
        <span className={styles.exampleLabel}>{audience.sourceLabel}</span>
        <blockquote>{audience.source}</blockquote>
        <ul className={styles.inputTags}>{audience.inputs.map((input) => <li key={input}>{input}</li>)}</ul>
      </div>}
      {stage.id === "week" && <div className={styles.planExample}>
        <p className={styles.flowSummary}>{audience.weekNote}</p>
        <WeekProgramme audience={audience} compact />
        <p className={styles.exampleSource}>Posts and assets, with a day and a purpose.</p>
      </div>}
      {stage.id === "review" && <div className={styles.reviewExample}>
        <h3>{audience.reviewTitle}</h3>
        <p>{audience.reviewDescription}</p>
        <ul className={styles.reviewChecks}>{audience.reviewChecks.map((check) => <li key={check}><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>{check}</li>)}</ul>
        <p className={`${styles.reviewNote} ${audienceId === "healthcare" ? styles.healthcareNote : ""}`}>{audience.reviewNote}</p>
      </div>}
    </div>)}
    <p className={styles.demoInstruction}>Explore the example. No content is created, approved or published here.</p>
  </div>;
}
