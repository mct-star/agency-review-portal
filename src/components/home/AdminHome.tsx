import Link from "next/link";
import type { Panel } from "@/lib/admin-home/types";
import { isWeekBoardEnabled } from "@/lib/constants/week-board";
import PanelCard from "./PanelCard";
import WelcomeMotion from "./WelcomeMotion";

/**
 * The operator's home: what is waiting across every client, the clients
 * themselves, the jobs that failed and the open tickets. Four panels, each
 * with three numbers and up to five rows you can act on in place. The one
 * surface that answers "what do I do next".
 */
export default function AdminHome({ greeting, panels }: { greeting: string; panels: Panel[] }) {
  return (
    <div className="space-y-8 pb-8">
      <div className="workspace-welcome flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="workspace-eyebrow">Your daily overview</p>
          <h1 className="workspace-title">{greeting}</h1>
          <p className="workspace-description">Your companies. Your content. A clear view of what needs you.</p>
        </div>
        <nav aria-label="Start" className="flex flex-wrap gap-2">
          <Link href="/generate/quick" className="workspace-button">Create a post <span aria-hidden="true">↗</span></Link>
          {isWeekBoardEnabled() && (
            <Link href="/admin/weeks" className="workspace-button workspace-button-secondary">Week Board</Link>
          )}
          <Link href="/setup" className="workspace-button workspace-button-secondary">Companies</Link>
        </nav>
        <WelcomeMotion />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        {panels.map((panel) => (
          <PanelCard key={panel.key} panel={panel} />
        ))}
      </div>
    </div>
  );
}
