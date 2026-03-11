"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function PublishButton({ weekId }: { weekId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handlePublish() {
    setLoading(true);
    const supabase = createClient();

    await supabase
      .from("weeks")
      .update({ status: "ready_for_review" })
      .eq("id", weekId);

    // Trigger notification (handled by API route)
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "content_ready", weekId }),
    });

    router.refresh();
    setLoading(false);
  }

  return (
    <button
      onClick={handlePublish}
      disabled={loading}
      className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
    >
      {loading ? "Publishing..." : "Publish for Review"}
    </button>
  );
}
