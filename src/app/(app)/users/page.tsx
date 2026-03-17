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
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

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

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail) return;

    setLoading(true);
    setMessage("");

    // The user record will be created when they first log in via magic link.
    // For now, we pre-create the user record so they're assigned to the right company.
    // We use the API to invite them via Supabase Auth.
    const response = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "invite_user",
        email: inviteEmail,
        fullName: inviteName,
        companyId: inviteCompanyId || null,
        role: inviteRole,
      }),
    });

    if (response.ok) {
      setMessage(`Invitation will be sent when ${inviteEmail} first logs in.`);
      setInviteEmail("");
      setInviteName("");
      await loadData();
    } else {
      setMessage("Failed to create invitation.");
    }

    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Users</h1>

      {/* Invite form */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">
          Pre-register User
        </h2>
        <p className="mb-4 text-xs text-gray-500">
          Add user details here. They will log in via magic link with their email.
        </p>

        <form onSubmit={handleInvite} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Email address"
              required
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Full name"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
          >
            {loading ? "Adding..." : "Add User"}
          </button>
          {message && (
            <p className="text-sm text-green-600">{message}</p>
          )}
        </form>
      </div>

      {/* Users list */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
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
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {user.full_name || "—"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {user.email}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      user.role === "admin"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {user.company ? (user.company as Company).name : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
