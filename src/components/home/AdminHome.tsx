import Link from "next/link";
import type { Panel } from "@/lib/admin-home/types";
import { isWeekBoardEnabled } from "@/lib/constants/week-board";
import PanelCard from "./PanelCard";

/**
 * The operator's home: what is waiting across every client, the clients
 * themselves, the jobs that failed and the open tickets. Four panels, each
 * with three numbers and up to five rows you can act on in place. The one
 * surface that answers "what do I do next".
 */
export default function AdminHome({ greeting, panels }: { greeting: string; panels: Panel[] }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12 pt-2 md:pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{greeting}</h1>
        <nav aria-label="Start" className="flex flex-wrap gap-2">
          <Link href="/generate/quick" className="inline-flex min-h-11 items-center rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-violet-700">Quick Post</Link>
          {isWeekBoardEnabled() && (
            <Link href="/admin/weeks" className="inline-flex min-h-11 items-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50">Week Board</Link>
          )}
          <Link href="/setup" className="inline-flex min-h-11 items-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50">Companies</Link>
        </nav>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {panels.map((panel) => (
          <PanelCard key={panel.key} panel={panel} />
        ))}
      </div>
    </div>
  );
}
