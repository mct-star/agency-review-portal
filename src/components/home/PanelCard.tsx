import Link from "next/link";
import type { Panel } from "@/lib/admin-home/types";
import PanelRow from "./PanelRow";

const TONE: Record<string, string> = {
  waiting: "bg-amber-100 text-amber-900",
  clients: "bg-violet-100 text-violet-900",
  jobs: "bg-sky-100 text-sky-900",
  tickets: "bg-emerald-100 text-emerald-900",
};

/** One of the four admin home panels: a coloured edge, three numbers, up to five rows. */
export default function PanelCard({ panel }: { panel: Panel }) {
  return (
    <section aria-labelledby={`panel-${panel.key}`} className="workspace-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span aria-hidden="true" className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm ${TONE[panel.key] ?? ""}`}>↗</span><h2 id={`panel-${panel.key}`} className="workspace-section-title">{panel.title}</h2></div>
        <Link href={panel.seeAll.href} className="flex min-h-11 items-center text-sm font-medium text-gray-600 hover:text-gray-900 hover:underline">{panel.seeAll.label} <span className="ml-2" aria-hidden="true">→</span></Link>
      </div>

      {panel.error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{panel.error}</p>
      ) : (
        <>
          <dl className="my-4 grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-1">
            {panel.numbers.map((n) => (
              <div key={n.label} className="px-2 py-3 sm:px-3">
                <dt className="text-xs text-gray-500">{n.label}</dt>
                <dd className={`mt-1 text-[28px] font-medium tabular-nums ${n.tone === "warn" ? "text-amber-800" : n.tone === "good" ? "text-emerald-800" : "text-gray-900"}`}>{n.value}</dd>
              </div>
            ))}
          </dl>
          {panel.rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500">Nothing waiting here. You are up to date.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100">
              {panel.rows.map((row) => (
                <PanelRow key={row.id} row={row} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
