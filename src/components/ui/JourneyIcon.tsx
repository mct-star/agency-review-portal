type Journey = "write" | "plan" | "review" | "talk" | "library" | "companies" | "jobs" | "support";

const paths: Record<Journey, string> = {
  write: "m15 4 5 5M5 19l1-5L17 3a2.1 2.1 0 0 1 3 3L9 17l-4 2ZM4 22h16",
  plan: "M7 2v4M17 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM7 14h2M15 14h2M7 18h2",
  review: "m7 12 3 3 7-7M21 12a9 9 0 1 1-5-8",
  talk: "M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0V5ZM5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8",
  library: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM3 17l6-6 5 5 3-3 4 4M15 7h.01",
  companies: "M8 21V5l4-2 8 4v14M4 21V11l4-2M2 21h20M12 8h4M12 12h4M12 16h4",
  jobs: "m13 2-8 12h6l-1 8 9-13h-7l1-7Z",
  support: "M4 13v-2a8 8 0 0 1 16 0v2M4 12H3v6h4v-6H4ZM20 12h1v6h-4v-6h3ZM20 18v1a3 3 0 0 1-3 3h-4",
};

/** A consistent, decorative marker beside an already-labelled action. */
export default function JourneyIcon({ kind }: { kind: Journey }) {
  return <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={paths[kind]} /></svg>;
}
