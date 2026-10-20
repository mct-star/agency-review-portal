"use client";

import MetricoolExportButton from "@/components/weeks/MetricoolExportButton";
import PublishingWorkspace from "@/components/publishing/PublishingWorkspace";

type Piece = { id: string; title: string | null; content_type: string; week_id: string | null };
type Week = { id: string; date_start: string; date_end: string };

/** Company publishers share the content-first flow; approved downloads remain available to reviewers. */
export default function ClientPublishView({ userId, companyId, canPublish, weeks, pieces, isHospitality = false, downloadsUnavailable = false }: {
  userId: string; companyId: string; canPublish: boolean; weeks: Week[]; pieces: Piece[]; isHospitality?: boolean; downloadsUnavailable?: boolean;
}) {
  return <div className="space-y-6">
    <div><p className="workspace-eyebrow">Review and publish</p><h1 className="workspace-title">Publish content</h1></div>
    <PublishingWorkspace key={companyId} userId={userId} companyId={companyId} canPublish={canPublish} isHospitality={isHospitality} />
    <section className="workspace-panel space-y-3 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Download approved posts</h2>
      {downloadsUnavailable ? <p role="alert" className="text-sm text-amber-800">Approved downloads could not be loaded. Reload this page to try again.</p> : weeks.length === 0 ? <p className="text-sm text-gray-600">No approved weekly downloads are available.</p> : <ul className="space-y-3">{weeks.map((week) => <li key={week.id} className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{week.date_start} to {week.date_end} | {pieces.filter((piece) => piece.week_id === week.id).length} approved posts</span><MetricoolExportButton weekId={week.id} draft={false} /></li>)}</ul>}
    </section>
  </div>;
}
