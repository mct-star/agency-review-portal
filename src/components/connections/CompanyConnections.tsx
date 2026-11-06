"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { connectionReturnHref, clearConnectionReturn, rememberConnectionReturn, type ConnectionReturnTarget } from "@/lib/connections/return-context";
import LinkedInConnections from "./LinkedInConnections";
import MetaPublishingPanel from "@/app/(app)/publish/MetaPublishingPanel";
import SocialPublishingPanel from "@/app/(app)/publish/SocialPublishingPanel";

/** Shared connection manager used by Settings and the initial setup journey. */
export default function CompanyConnections({ companyId, canPublish, canConnect, canSelfConnect = false, isHospitality = false, userId, returnTarget }: {
  companyId: string; canPublish: boolean; canConnect: boolean; canSelfConnect?: boolean; isHospitality?: boolean; userId?: string; returnTarget?: ConnectionReturnTarget;
}) {
  const params = useSearchParams();
  const [returnHref, setReturnHref] = useState<string | null>(null);
  const [pendingMetaSelection, setPendingMetaSelection] = useState(params.get("meta_choose_page") === "1");
  useEffect(() => {
    if (!userId) return;
    if (returnTarget) rememberConnectionReturn(userId, companyId, returnTarget);
    else if (params.get("from") === "publish") rememberConnectionReturn(userId, companyId, "publish");
    setReturnHref(connectionReturnHref(userId, companyId));
  }, [companyId, userId, returnTarget, params]);
  return <div className="space-y-6">
    <div><h2 className="text-xl font-semibold text-gray-900">{canSelfConnect ? "Connect your channels" : "Connections"}</h2><p className="mt-1 text-sm text-gray-600">{canSelfConnect ? "Connect or disconnect the accounts your posts publish to. Only your own company's accounts are shown here." : "Connect the accounts you want to publish to. You can create and review content before connecting."}</p></div>
    {!canPublish ? <div className="rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-600">Publishing is not switched on for your account, so you cannot connect channels yourself. Ask your AGENCY contact to switch it on, or to connect or reconnect an account for you.</div> : <>
      {!isHospitality && <LinkedInConnections key={`linkedin-${companyId}`} companyId={companyId} canConnect={canConnect || canSelfConnect} />}
      <MetaPublishingPanel key={`meta-${companyId}`} companyId={companyId} canPublish={canPublish} mode="manage" onConnectionChanged={() => setPendingMetaSelection(false)} />
      {!isHospitality && <SocialPublishingPanel key={`social-${companyId}`} companyId={companyId} canPublish={canPublish} canConnect={canConnect} connectable={canSelfConnect ? ["bluesky"] : []} mode="manage" />}
    </>}
    {!returnTarget && returnHref && !pendingMetaSelection && <Link href={returnHref} onClick={() => userId && clearConnectionReturn(userId, companyId)} className="inline-flex min-h-11 items-center rounded-md bg-sky-700 px-4 text-sm font-semibold text-white">{returnHref.startsWith("/publish") ? "Back to publishing" : "Continue setup"}</Link>}
  </div>;
}
