/**
 * Which networks a post is flagged for in the scheduler CSV.
 *
 * A company with no networks chosen (every company before the hospitality
 * pack existed) posts to LinkedIn only, exactly as before. A hospitality
 * company is set to Facebook and Instagram. Instagram needs a picture or a
 * video on every post, so a post with none is exported for the other
 * networks only, and the export says so rather than quietly dropping it.
 */

export interface NetworkFlags {
  facebook: boolean;
  instagram: boolean;
  linkedin: boolean;
  twitter: boolean;
  threads: boolean;
  bluesky: boolean;
  tiktok: boolean;
  gbp: boolean;
}

export function networksFor(companyNetworks: string[] | null | undefined): string[] {
  return companyNetworks && companyNetworks.length > 0 ? companyNetworks : ["linkedin"];
}

export function networkFlags(networks: string[], hasMedia: boolean): { flags: NetworkFlags; instagramSkipped: boolean } {
  const has = (n: string) => networks.includes(n);
  const wantsInstagram = has("instagram");
  const instagram = wantsInstagram && hasMedia;
  return {
    instagramSkipped: wantsInstagram && !hasMedia,
    flags: {
      facebook: has("facebook"),
      instagram,
      linkedin: has("linkedin"),
      twitter: has("x"),
      threads: has("threads"),
      bluesky: has("bluesky"),
      tiktok: has("tiktok"),
      gbp: has("gbp"),
    },
  };
}
