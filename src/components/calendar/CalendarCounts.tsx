interface ApprovalItem { approval_status: string }

export function calendarViewPieces<T>(cells: { isCurrentMonth: boolean; pieces: T[] }[], view: "week" | "month"): T[] {
  return cells.filter(cell => view === "week" || cell.isCurrentMonth).flatMap(cell => cell.pieces);
}

export default function CalendarCounts({ items, heading, scope, note, loading = false, error }: {
  items: ApprovalItem[];
  heading: string;
  scope: string;
  note: string;
  loading?: boolean;
  error?: string | null;
}) {
  const approved = items.filter(item => item.approval_status === "approved").length;
  const pending = items.filter(item => item.approval_status === "pending").length;
  const changes = items.filter(item => item.approval_status === "changes_requested").length;
  const other = items.length - approved - pending - changes;

  return (
    <section className="workspace-panel space-y-2 p-4" aria-label={heading}>
      <h3 className="text-sm font-medium text-gray-900">{heading}</h3>
      <p className="text-xs text-gray-600">{scope}</p>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : loading ? (
        <p role="status" className="text-sm text-gray-500">Loading counts...</p>
      ) : (
        <ul aria-label="Post counts" className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-600">
          <li className="font-medium text-gray-900">{items.length} {items.length === 1 ? "post shown" : "posts shown"}</li>
          <li>{approved} approved</li>
          <li>{pending} pending approval</li>
          <li>{changes} changes requested</li>
          {other > 0 && <li>{other} {other === 1 ? "other status" : "other statuses"}</li>}
        </ul>
      )}
      <p className="text-xs text-gray-500">{note}</p>
    </section>
  );
}

export function UnscheduledCount({ count, loading, error }: { count: number; loading: boolean; error: string | null }) {
  return (
    <div className="mb-2 space-y-1 px-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Unscheduled</h3>
      <p className="text-sm text-gray-700">{error ? "Count unavailable" : loading ? "Loading posts..." : `${count} ${count === 1 ? "post shown" : "posts shown"}`}</p>
      <p className="text-xs text-gray-500">All dates and approval statuses. Up to 60 newest posts without a scheduled day, plus posts saved under Standalone content.</p>
    </div>
  );
}
