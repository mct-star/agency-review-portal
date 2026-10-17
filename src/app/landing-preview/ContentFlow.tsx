"use client";

import { useRef, useState } from "react";
import styles from "./preview.module.css";

const stages = [
  { id: "source", number: "01", label: "Your thought", summary: "Start with something only you can say." },
  { id: "draft", number: "02", label: "A first draft", summary: "Give your thinking a shape and a voice." },
  { id: "review", number: "03", label: "Your final say", summary: "Read it, refine it, make it yours." },
] as const;

export default function ContentFlow() {
  const [activeStage, setActiveStage] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveTo(index: number) {
    setActiveStage(index);
    tabs.current[index]?.focus();
  }

  return (
    <div className={styles.flowDemo}>
      <div className={styles.flowTabs} role="tablist" aria-label="Explore the content process">
        {stages.map((stage, index) => (
          <button
            key={stage.id}
            ref={(element) => { tabs.current[index] = element; }}
            id={`flow-tab-${stage.id}`}
            type="button"
            role="tab"
            aria-selected={index === activeStage}
            aria-controls={`flow-panel-${stage.id}`}
            tabIndex={index === activeStage ? 0 : -1}
            className={`${styles.flowTab} ${index === activeStage ? styles.flowTabActive : ""}`}
            onClick={() => setActiveStage(index)}
            onKeyDown={(event) => {
              let next: number | null = null;
              if (event.key === "ArrowRight") next = (index + 1) % stages.length;
              if (event.key === "ArrowLeft") next = (index - 1 + stages.length) % stages.length;
              if (event.key === "Home") next = 0;
              if (event.key === "End") next = stages.length - 1;
              if (next !== null) { event.preventDefault(); moveTo(next); }
            }}
          >
            <span className={styles.flowNumber}>{stage.number}</span>
            <span>{stage.label}</span>
          </button>
        ))}
      </div>

      {stages.map((stage, index) => <div
        key={stage.id}
        className={styles.flowPanel}
        id={`flow-panel-${stage.id}`}
        role="tabpanel"
        aria-labelledby={`flow-tab-${stage.id}`}
        hidden={index !== activeStage}
        tabIndex={0}
      >
        <div className={styles.flowPanelHeading}><span>SAMPLE CONTENT</span><span>{stage.number} / 03</span></div>
        <p className={styles.flowSummary}>{stage.summary}</p>

        {stage.id === "source" && (
          <div className={styles.thoughtExample}>
            <span className={styles.exampleLabel}>A thought after a meeting</span>
            <blockquote>“I keep hearing people say they have nothing to post. But they answer useful questions all day. That’s where I’d start.”</blockquote>
            <div className={styles.exampleSource}><span className={styles.smallDot} />Your experience is the starting point.</div>
          </div>
        )}

        {stage.id === "draft" && (
          <div className={styles.draftExample}>
            <span className={styles.exampleLabel}>A possible opening</span>
            <h3>Your next post is hiding in your last meeting.</h3>
            <p>You explained something. Answered a question. Helped someone see a problem differently.</p>
            <p>Start there. The thing that feels obvious to you could be exactly what someone else needs.</p>
          </div>
        )}

        {stage.id === "review" && (
          <div className={styles.reviewExample}>
            <span className={styles.exampleLabel}>Read it with your own voice in mind</span>
            <h3>Would you say it this way?</h3>
            <p>The draft gives you a starting point. You decide what stays, what changes and what is ready to share.</p>
            <div className={styles.reviewPrompt}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 3 2 8l10 5 10-5-10-5ZM4 13l8 4 8-4m-16 5 8 4 8-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg><span>Your judgement belongs in the process.</span></div>
          </div>
        )}
      </div>)}
      <p className={styles.demoInstruction}>Select a step to explore the example. This is an illustration.</p>
    </div>
  );
}
