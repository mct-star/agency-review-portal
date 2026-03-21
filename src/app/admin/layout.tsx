import { redirect } from "next/navigation";
import { getUser, getUserProfile } from "@/lib/supabase/server";
import Sidebar from "@/components/layout/Sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getUserProfile();

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow-sm border border-gray-200 text-center">
          <h1 className="text-xl font-bold text-gray-900">Almost there</h1>
          <p className="text-sm text-gray-500">
            You&apos;re signed in as <strong>{user.email}</strong> but your
            account hasn&apos;t been set up yet.
          </p>
          <p className="text-sm text-gray-400">
            Ask an admin to add you to the portal.
          </p>
        </div>
      </div>
    );
  }

  if (profile.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="flex h-screen">
      <Sidebar user={profile} companyPlan="agency" />
      <main className="flex-1 overflow-y-auto bg-gray-50 p-6">{children}</main>
    </div>
  );
}
