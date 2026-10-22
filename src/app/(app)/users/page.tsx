"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User, Company } from "@/types/database";

export default function UsersPage() {
  const [users, setUsers] = useState<(User & { company?: Company })[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteCompanyId, setInviteCompanyId] = useState("");
  const [inviteRole, setInviteRole] = useState<"client" | "admin">("client");
  const [inviteCanPublish, setInviteCanPublish] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rowStatus, setRowStatus] = useState<Record<string, { kind: "saving" | "saved" | "error"; text: string }>>({});

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const supabase = createClient();
    const { data: usersData } = await supabase
      .from("users")
      .select("*, company:companies(*)")
      .order("created_at", { ascending: false });

    const { data: companiesData } = await supabase
      .from("companies")
      .select("*")
      .order("name");

    if (usersData) setUsers(usersData);
    if (companiesData) setCompanies(companiesData);
  }

  /** Save one field of one person. The control keeps its old value until the server confirms. */
  async function saveUser(
    userId: string,
    changes: { role?: "admin" | "client"; company_id?: string | null; can_publish?: boolean }
  ) {
    setRowStatus((p) => ({ ...p, [userId]: { kind: "saving", text: "Saving" } }));
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRowStatus((p) => ({
          ...p,
          [userId]: { kind: "error", text: result.error || `Not saved (${res.status})` },
        }));
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...result.data } : u)));
      setRowStatus((p) => ({ ...p, [userId]: { kind: "saved", text: "Saved" } }));
    } catch {
      setRowStatus((p) => ({
        ...p,
        [userId]: { kind: "error", text: "Not saved. Check your connection and try again." },
      }));
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail) return;

    if (inviteRole === "admin") {
      setMessage({ text: "Administrators are added in the Supabase dashboard, not from here.", type: "error" });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      // The server creates the account, links it to the company and sends
      // the sign-in email. See /api/company/invite.
      const res = await fetch("/api/company/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          fullName: inviteName || undefined,
          companyId: inviteCompanyId || undefined,
          canPublish: inviteCanPublish,
        }),
      });
      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage({ text: result.error || "Failed to create invitation.", type: "error" });
      } else if (result.emailSent) {
        setMessage({
          text: `Invitation sent to ${inviteEmail}. The sign-in link in the email works once.`,
          type: "success",
        });
        setInviteEmail("");
        setInviteName("");
        setInviteCanPublish(false);
        await loadData();
      } else {
        setMessage({
          text: `The person is set up but the email could not be sent (${result.emailError || "no mail provider configured"}).${result.signInUrl ? ` Send them this one-time link yourself: ${result.signInUrl}` : ""}`,
          type: "error",
        });
        await loadData();
      }
    } catch {
      setMessage({ text: "Failed to create invitation.", type: "error" });
    }

    setLoading(false);
  }

  async function handleSendMagicLink(user: User) {
    setActionLoading(user.id);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "magic_link",
          to: user.email,
          userName: user.full_name || user.email.split("@")[0],
        }),
      });
      const result = await res.json();
      if (result.success) {
        setMessage({ text: `Sign-in link sent to ${user.email}`, type: "success" });
      } else {
        setMessage({ text: `Failed to send: ${result.error}`, type: "error" });
      }
    } catch {
      setMessage({ text: "Failed to send sign-in link.", type: "error" });
    }
    setActionLoading(null);
  }

  async function handleSendWelcome(user: User & { company?: Company }) {
    setActionLoading(user.id);
    const company = user.company;
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "welcome",
          to: user.email,
          userName: user.full_name || user.email.split("@")[0],
          companyName: company?.name || "AGENCY Bristol",
        }),
      });
      const result = await res.json();
      if (result.success) {
        setMessage({ text: `Welcome email sent to ${user.email}`, type: "success" });
      } else {
        setMessage({ text: `Failed: ${result.error}`, type: "error" });
      }
    } catch {
      setMessage({ text: "Failed to send welcome email.", type: "error" });
    }
    setActionLoading(null);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Users</h1>

      {/* Status message */}
      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
          <button
            onClick={() => setMessage(null)}
            className="ml-2 text-xs opacity-60 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Invite form */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">
          Invite New User
        </h2>
        <p className="mb-4 text-xs text-gray-500">
          Add a user and send them a branded welcome email from mct@agencybristol.com. They sign in via magic link (no password needed).
        </p>

        <form onSubmit={handleInvite} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Email address"
              required
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-300 focus:outline-none focus:ring-1 focus:ring-sky-300"
            />
            <input
              type="text"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Full name"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-300 focus:outline-none focus:ring-1 focus:ring-sky-300"
            />
            <select
              value={inviteCompanyId}
              onChange={(e) => setInviteCompanyId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">No company (admin)</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "client" | "admin")}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="client">Client</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={inviteCanPublish}
              onChange={(e) => setInviteCanPublish(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-sky-500 focus:ring-sky-400"
            />
            <span className="text-sm text-gray-600">
              Can post to LinkedIn <span className="text-xs text-gray-500">(grants access to Post section)</span>
            </span>
          </label>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-sky-500 px-5 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
          >
            {loading ? "Sending Invite..." : "Add User & Send Welcome Email"}
          </button>
        </form>
      </div>

      {/* Users list */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-[900px] w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Company
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Post
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map((user) => {
              const isLoading = actionLoading === user.id;
              const status = rowStatus[user.id];
              return (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {user.full_name || "(no name)"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {user.email}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      onChange={(e) => saveUser(user.id, { role: e.target.value as "admin" | "client" })}
                      disabled={status?.kind === "saving"}
                      aria-label={`Role for ${user.email}`}
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                    >
                      <option value="client">Client</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.company_id ?? ""}
                      onChange={(e) => saveUser(user.id, { company_id: e.target.value || null })}
                      disabled={status?.kind === "saving"}
                      aria-label={`Company for ${user.email}`}
                      className="max-w-[180px] rounded border border-gray-300 px-2 py-1 text-xs"
                    >
                      <option value="">No company</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {user.role === "admin" ? (
                      <span className="text-xs text-gray-500">always</span>
                    ) : (
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={!!user.can_publish}
                          onChange={(e) => saveUser(user.id, { can_publish: e.target.checked })}
                          disabled={status?.kind === "saving"}
                          className="h-4 w-4 rounded border-gray-300 text-sky-500"
                        />
                        Publish
                      </label>
                    )}
                    {status && (
                      <p
                        role={status.kind === "error" ? "alert" : "status"}
                        className={`mt-1 text-xs ${
                          status.kind === "error" ? "text-red-600" : status.kind === "saved" ? "text-green-600" : "text-gray-500"
                        }`}
                      >
                        {status.text}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleSendMagicLink(user)}
                        disabled={isLoading}
                        className="rounded border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                        title="Send sign-in link"
                      >
                        {isLoading ? "..." : "Send Login Link"}
                      </button>
                      <button
                        onClick={() => handleSendWelcome(user)}
                        disabled={isLoading}
                        className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-medium text-sky-600 hover:bg-sky-100 disabled:opacity-50"
                        title="Resend welcome email"
                      >
                        {isLoading ? "..." : "Resend Welcome"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
