export type MetaConnectionAccount = {
  id: string;
  platform: "facebook" | "instagram";
  accountName: string;
  accountId?: string | null;
  pageId?: string | null;
  usable: boolean;
};

/** Linked Facebook and Instagram identities share one underlying Page grant. */
export function groupMetaConnections(accounts: MetaConnectionAccount[]) {
  const groups = new Map<string, MetaConnectionAccount[]>();
  for (const account of accounts) {
    const key = account.pageId || (account.platform === "facebook" ? account.accountId : null) || account.id;
    groups.set(key, [...(groups.get(key) || []), account]);
  }
  return [...groups.entries()].map(([pageId, members]) => ({
    pageId,
    accounts: members,
    disconnectId: (members.find((account) => account.platform === "facebook") || members[0]).id,
    usable: members.every((account) => account.usable),
  }));
}

/** Only the two supported local destinations can be used after a signed social grant. */
export function socialOAuthReturnPath(companyId: string | undefined, returnTo: unknown, query: string) {
  if (companyId && returnTo !== "publish") return `/setup/${encodeURIComponent(companyId)}/social?${query}`;
  const params = new URLSearchParams(query);
  if (companyId) params.set("companyId", companyId);
  return `/publish?${params}`;
}
