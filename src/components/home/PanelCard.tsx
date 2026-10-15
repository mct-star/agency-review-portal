import Link from "next/link";
import type { Panel } from "@/lib/admin-home/types";
import PanelRow from "./PanelRow";

const TONE: Record<string, string> = {
  waiting: "border-amber-400",
  clients: "border-violet-400",
  jobs: "border-sky-400",
  tickets: "border-emerald-400",
};

/** One of the four admin home panels: a coloured edge, three numbers, up to five rows. */
export default function PanelCard({ panel }: { panel: Panel }) {
  return (
    <section aria-labelledby={`panel-${panel.key}`} className={`rounded-2xl border border-gray-200 border-l-4 bg-white p-5 shadow-sm ${TONE[panel.key] ?? ""}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`panel-${panel.key}`} className="text-base font-semibold text-gray-900">{panel.title}</h2>
        <Link href={panel.seeAll.href} className="text-xs font-medium text-violet-700 hover:underline">{panel.seeAll.label}</Link>
      </div>

      {panel.error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{panel.error}</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            {panel.numbers.map((n) => (
              <div key={n.label} className="rounded-lg bg-gray-50 px-3 py-2">
                <dt className="text-xs text-gray-500">{n.label}</dt>
                <dd className={`text-xl font-bold ${n.tone === "warn" ? "text-amber-700" : n.tone === "good" ? "text-emerald-700" : "text-gray-900"}`}>{n.value}</dd>
              </div>
            ))}
          </dl>
          {panel.rows.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">Nothing waiting here.</p>
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
