import type { Metadata } from "next";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { companyForToken } from "@/lib/staff-upload/access";
import StaffUploader from "./StaffUploader";

export const metadata: Metadata = {
  title: "Add a photo",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

export default async function AddPhotoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createAdminSupabaseClient();
  const company = await companyForToken(supabase, token);

  if (!company) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
        <h1 className="text-xl font-semibold text-gray-900">This link is not working</h1>
        <p className="mt-2 text-sm text-gray-600">It may have been replaced. Ask your manager for the new one.</p>
      </main>
    );
  }
  return <StaffUploader token={token} companyName={company.name} />;
}
