import { NextResponse } from "next/server";
import { getSignedInProfile, requireCompanyUser } from "@/lib/supabase/admin";
import { refuseHospitality } from "@/lib/hospitality/pack-guard";
import { canManageChannels } from "./permissions";

type Profile = NonNullable<Awaited<ReturnType<typeof requireCompanyUser>>>;

export type ChannelAuth =
  | { ok: true; profile: Profile }
  | { ok: false; status: 401 | 403; response: NextResponse };

const deny = (status: 401 | 403, error: string, code?: string): ChannelAuth => ({
  ok: false,
  status,
  response: NextResponse.json(code ? { error, code } : { error }, { status }),
});

/**
 * The one gate for connecting, replacing and disconnecting a company's
 * publishing channels. Runs before any read or write of channel data.
 *
 * - No sign-in: 401.
 * - Signed in but not an admin, or not a client of THIS company with the
 *   publish right: 403. A client naming another company's id gets the same 403
 *   as a client without the right, and learns nothing about the other company.
 * - `fence: true` (connect routes) also applies the hospitality fence, so a
 *   venue's people are not given tools that are not part of their pack. The
 *   operator is never refused.
 */
export async function authoriseChannelManager(companyId: string | null | undefined, options: { fence?: boolean } = {}): Promise<ChannelAuth> {
  if (!companyId) return deny(403, "You cannot manage publishing channels for this company.");
  const member = await requireCompanyUser(companyId);
  if (!member) {
    const signedIn = await getSignedInProfile();
    return signedIn
      ? deny(403, "You cannot manage publishing channels for this company.")
      : deny(401, "Unauthorized");
  }
  if (!canManageChannels(member, companyId)) {
    return deny(403, "Your account cannot manage publishing channels. Ask your AGENCY contact to switch publishing on.");
  }
  if (options.fence) {
    const refused = await refuseHospitality(member, companyId);
    if (refused) return { ok: false, status: 403, response: refused };
  }
  return { ok: true, profile: member };
}
