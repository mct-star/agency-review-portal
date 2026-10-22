import { AsyncLocalStorage } from "node:async_hooks";

/** Only the verified, company-scoped Ops bridge can establish this context. */
export interface ContentPrincipal {
  id: string;
  role: "admin";
  companyId: string;
  model: string;
  modelLabel: string;
}

const contentContext = new AsyncLocalStorage<ContentPrincipal>();

export const contentPrincipal = () => contentContext.getStore();
export function withContentPrincipal<T>(principal: ContentPrincipal, action: () => T): T {
  return contentContext.run(principal, action);
}
