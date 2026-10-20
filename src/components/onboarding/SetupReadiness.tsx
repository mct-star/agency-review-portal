import Link from "next/link";
import type { SetupReadiness as Readiness } from "@/lib/onboarding/readiness";

/** A shared workspace's current readiness, with an optional route back into setup. */
export default function SetupReadiness({ companyId, readiness, hospitality = false }: {
  companyId: string;
  readiness: Readiness;
  hospitality?: boolean;
}) {
  const items = [
    { label: "Brand basics", done: readiness.brand },
    ...(!hospitality ? [{ label: "Writing voice", done: readiness.voice }] : []),
    { label: "Social accounts", done: readiness.connections },
  ];
  const complete = !readiness.unavailable && items.every((item) => item.done);
  return <section className="workspace-panel p-5 sm:p-6" aria-label="Workspace setup">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="workspace-section-title">{complete ? "Your workspace is ready" : "Finish setup"}</h2>
        <p className="mt-1 text-sm text-gray-600">{readiness.unavailable
          ? "Some setup details could not be checked. Open setup to try again."
          : "These settings are shared with your team. You can create content while you finish them."}</p>
      </div>
      <Link href={`/setup/${companyId}/start`} className="workspace-button workspace-button-secondary">
        {complete ? "Review setup" : "Finish setup"}
      </Link>
    </div>
    <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Setup status">
      {items.map((item) => <li key={item.label}>{item.label}: <span className={item.done ? "text-green-700" : "text-gray-600"}>
        {item.done ? "Ready" : readiness.unavailable ? "Check setup" : "Optional to add"}
      </span></li>)}
    </ul>
  </section>;
}
