export type ConnectionReturnTarget = "setup" | "publish";
const keyFor = (userId: string, companyId: string) => `connection-return:${encodeURIComponent(userId)}:${encodeURIComponent(companyId)}`;

/** Stores only a fixed local return intent, scoped to the signed-in user and company. */
export function rememberConnectionReturn(userId: string, companyId: string, target: ConnectionReturnTarget) {
  if (!userId || !companyId || !["setup", "publish"].includes(target)) return;
  try { window.sessionStorage.setItem(keyFor(userId, companyId), target); } catch { /* Connections remain usable when browser storage is unavailable. */ }
}

export function connectionReturnHref(userId: string, companyId: string): string | null {
  try {
    const target = window.sessionStorage.getItem(keyFor(userId, companyId));
    if (target === "setup") return `/setup/${encodeURIComponent(companyId)}/start`;
    if (target === "publish") return `/publish?companyId=${encodeURIComponent(companyId)}`;
  } catch { /* A missing return intent leaves the user in normal Settings. */ }
  return null;
}

export function clearConnectionReturn(userId: string, companyId: string) {
  try { window.sessionStorage.removeItem(keyFor(userId, companyId)); } catch { /* Storage is optional. */ }
}
