import {
  canInvite,
  canSetPublishRight,
  type AccessProfile,
} from "@/lib/auth/permissions";

/**
 * The decision half of inviting someone into a company, free of any
 * network call so it can be tested. The route loads the caller and any
 * existing user with the same email, asks `planInvite`, and only then
 * touches Supabase Auth.
 */

export interface InviteInput {
  email?: unknown;
  fullName?: unknown;
  companyId?: unknown;
  canPublish?: unknown;
  sendEmail?: unknown;
}

export interface ExistingUser {
  id: string;
  role: string;
  company_id: string | null;
}

export type InvitePlan =
  | {
      ok: true;
      email: string;
      fullName: string | null;
      companyId: string;
      canPublish: boolean;
      sendEmail: boolean;
      /** The email already has an account in this company: send a fresh link only. */
      resend: boolean;
    }
  | { ok: false; status: 400 | 401 | 403 | 409; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function planInvite(
  caller: AccessProfile | null,
  input: InviteInput,
  existing: ExistingUser | null
): InvitePlan {
  if (!caller) return { ok: false, status: 401, error: "Unauthorized" };

  if (input.sendEmail !== undefined && typeof input.sendEmail !== "boolean") {
    return { ok: false, status: 400, error: "sendEmail must be a boolean" };
  }
  if (input.sendEmail === false && caller.role !== "admin") {
    return { ok: false, status: 403, error: "Only an administrator can create an account without email" };
  }

  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { ok: false, status: 400, error: "Enter a valid email address" };
  }

  // A member invites into their own company without naming it; an admin names it.
  const companyId =
    typeof input.companyId === "string" && input.companyId
      ? input.companyId
      : caller.role === "admin"
        ? ""
        : caller.company_id ?? "";
  if (!UUID_RE.test(companyId)) {
    return { ok: false, status: 400, error: "Choose which company the person belongs to" };
  }
  if (!canInvite(caller, companyId)) {
    return { ok: false, status: 403, error: "You can only invite people into your own company" };
  }

  if (existing) {
    // Never repoint an admin or a member of another company.
    if (existing.role === "admin") {
      return { ok: false, status: 409, error: "That email belongs to an AGENCY administrator" };
    }
    if (existing.company_id && existing.company_id !== companyId) {
      return { ok: false, status: 409, error: "That email already belongs to another company" };
    }
  }

  const fullName =
    typeof input.fullName === "string" && input.fullName.trim()
      ? input.fullName.trim().slice(0, 120)
      : null;

  // Only an admin may grant the right to publish.
  const canPublish = canSetPublishRight(caller) && input.canPublish === true;

  return {
    ok: true,
    email,
    fullName,
    companyId,
    canPublish,
    sendEmail: input.sendEmail !== false,
    resend: !!existing,
  };
}

/** The one-time sign-in address built from the hashed token Supabase returns. */
export function buildSignInUrl(
  baseUrl: string,
  hashedToken: string,
  type: "invite" | "magiclink"
): string {
  const root = baseUrl.replace(/\/+$/, "");
  return `${root}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=${type}`;
}
