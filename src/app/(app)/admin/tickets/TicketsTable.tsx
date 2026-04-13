"use client";

import { useState } from "react";

interface Ticket {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  reporter_name: string | null;
  reporter_email: string | null;
  page_url: string | null;
  browser_info: string | null;
  screen_size: string | null;
  error_message: string | null;
  console_errors: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

interface TicketsTableProps {
  tickets: Ticket[];
}

const STATUS_STYLES: Record<string, string> = {
  open: "bg-gray-100 text-gray-700",
  investigating: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-slate-100 text-slate-600",
  wont_fix: "bg-slate-100 text-slate-600",
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
  critical: "bg-red-100 text-red-700 animate-pulse",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TicketsTable({ tickets: initialTickets }: TicketsTableProps) {
  const [tickets, setTickets] = useState(initialTickets);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  async function updateStatus(ticketId: string, newStatus: string) {
    setUpdating(ticketId);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, status: newStatus }),
      });
      if (res.ok) {
        setTickets((prev) =>
          prev.map((t) =>
            t.id === ticketId
              ? { ...t, status: newStatus, updated_at: new Date().toISOString() }
              : t
          )
        );
      }
    } finally {
      setUpdating(null);
    }
  }

  if (tickets.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-12 text-center">
        <p className="text-sm text-gray-500">No tickets yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-500">Priority</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-500">Title</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-500">Reporter</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-500">Date</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-500">Page</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {tickets.map((ticket) => {
            const isExpanded = expandedId === ticket.id;
            return (
              <tr key={ticket.id} className="group">
                <td colSpan={6} className="p-0">
                  {/* Summary row */}
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                    className="flex w-full items-center text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="px-4 py-3 w-[110px]">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[ticket.status] || ""}`}>
                        {formatStatus(ticket.status)}
                      </span>
                    </span>
                    <span className="px-4 py-3 w-[90px]">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${PRIORITY_STYLES[ticket.priority] || ""}`}>
                        {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                      </span>
                    </span>
                    <span className="flex-1 px-4 py-3 font-medium text-gray-900 truncate">
                      {ticket.title}
                    </span>
                    <span className="px-4 py-3 w-[140px] text-gray-600 truncate">
                      {ticket.reporter_name || ticket.reporter_email || "Unknown"}
                    </span>
                    <span className="px-4 py-3 w-[100px] text-gray-500 text-xs">
                      {formatDate(ticket.created_at)}
                    </span>
                    <span className="px-4 py-3 w-[140px] text-gray-400 text-xs truncate">
                      {ticket.page_url ? new URL(ticket.page_url).pathname : "-"}
                    </span>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50 px-6 py-4 space-y-3">
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 mb-1">Description</h4>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{ticket.description}</p>
                      </div>

                      {ticket.page_url && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 mb-1">Page URL</h4>
                          <p className="text-xs text-gray-600 break-all">{ticket.page_url}</p>
                        </div>
                      )}

                      {ticket.browser_info && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 mb-1">Browser</h4>
                          <p className="text-xs text-gray-600 break-all">{ticket.browser_info}</p>
                        </div>
                      )}

                      {ticket.screen_size && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 mb-1">Screen Size</h4>
                          <p className="text-xs text-gray-600">{ticket.screen_size}</p>
                        </div>
                      )}

                      {ticket.console_errors && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 mb-1">Console Errors</h4>
                          <pre className="rounded bg-gray-900 p-3 text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">
                            {ticket.console_errors}
                          </pre>
                        </div>
                      )}

                      {ticket.resolution_notes && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 mb-1">Resolution Notes</h4>
                          <p className="text-sm text-gray-800">{ticket.resolution_notes}</p>
                        </div>
                      )}

                      {/* Quick actions */}
                      <div className="flex gap-2 pt-2 border-t border-gray-200">
                        {ticket.status !== "investigating" && (
                          <button
                            onClick={() => updateStatus(ticket.id, "investigating")}
                            disabled={updating === ticket.id}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                          >
                            Mark Investigating
                          </button>
                        )}
                        {ticket.status !== "in_progress" && (
                          <button
                            onClick={() => updateStatus(ticket.id, "in_progress")}
                            disabled={updating === ticket.id}
                            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-40"
                          >
                            Mark In Progress
                          </button>
                        )}
                        {ticket.status !== "resolved" && (
                          <button
                            onClick={() => updateStatus(ticket.id, "resolved")}
                            disabled={updating === ticket.id}
                            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-40"
                          >
                            Mark Resolved
                          </button>
                        )}
                        {ticket.status !== "closed" && (
                          <button
                            onClick={() => updateStatus(ticket.id, "closed")}
                            disabled={updating === ticket.id}
                            className="rounded-lg bg-slate-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40"
                          >
                            Close
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
