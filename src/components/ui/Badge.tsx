import type { ApprovalStatus, WeekStatus } from "@/types/database";

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  ready_for_review: "bg-sky-100 text-sky-700",
  approved: "bg-green-100 text-green-700",
  changes_requested: "bg-amber-100 text-amber-700",
  pending: "bg-amber-50 text-amber-800",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  ready_for_review: "Ready for review",
  approved: "Approved",
  changes_requested: "Changes requested",
  pending: "Awaiting review",
};

interface BadgeProps {
  status: WeekStatus | ApprovalStatus;
}

export default function Badge({ status }: BadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusColors[status] || "bg-gray-100 text-gray-700"}`}
    >
      {statusLabels[status] || status}
    </span>
  );
}
