"use client";

import Image from "next/image";
import { memo, useState } from "react";
import { audiences, type AudienceId } from "./audiences";
import styles from "./social-post.module.css";

export type SocialPlatform = "instagram" | "facebook" | "linkedin";
const platforms: { id: SocialPlatform; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
];

function MoreIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>; }
function GlobeIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M4.5 9h15M4.5 15h15M12 4c2.2 2.2 3.2 4.9 3.2 8s-1 5.8-3.2 8c-2.2-2.2-3.2-4.9-3.2-8s1-5.8 3.2-8Z" /></svg>; }
function HeartIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.3 8.8c0 4.3-8.3 10.3-8.3 10.3S3.7 13.1 3.7 8.8a4.1 4.1 0 0 1 7.5-2.2l.8 1.1.8-1.1a4.1 4.1 0 0 1 7.5 2.2Z" /></svg>; }
function CommentIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.4a7.5 7.5 0 0 1-8 7.1 8.7 8.7 0 0 1-3.7-.8L4 19l1.3-3.6A6.7 6.7 0 0 1 4 11.4a7.5 7.5 0 0 1 8-7.1 7.5 7.5 0 0 1 8 7.1Z" /></svg>; }
function SendIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 3-7.4 18-3.8-7.8L2 9.4 21 3Z" /><path d="m9.8 13.2 5-5" /></svg>; }
function SaveIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h12v16l-6-4-6 4v-16Z" /></svg>; }
function ThumbIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v10H4V10h3Zm0 9.5h8.7a2 2 0 0 0 1.9-1.5l1.7-6.2a1.8 1.8 0 0 0-1.7-2.3h-5.1l.7-3.2a2 2 0 0 0-2-2.3L7 10v9.5Z" /></svg>; }
function RepostIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 3-3 3 3M10 4v10a3 3 0 0 0 3 3h4M17 17l-3 3-3-3m3 3V13a3 3 0 0 0-3-3H7" /></svg>; }

function PlatformMark({ platform }: { platform: SocialPlatform }) {
  if (platform === "linkedin") return <svg className={styles.linkedinMark} viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 8.6H2.5V21h2.7V8.6ZM3.8 2.5a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2ZM21.5 13.9c0-3.7-2-5.5-4.6-5.5a4 4 0 0 0-3.6 2v-1.8h-2.7V21h2.7v-6.1c0-1.6.3-3.2 2.3-3.2s2 1.9 2 3.3V21h2.8l1.1-7.1Z" /></svg>;
  if (platform === "facebook") return <svg className={styles.facebookMark} viewBox="0 0 24 24" aria-hidden="true"><path d="M14.1 21v-8.2h2.8l.4-3.2h-3.2v-2c0-.9.3-1.5 1.6-1.5h1.7V3.2c-.3 0-1.4-.2-2.6-.2-2.6 0-4.3 1.6-4.3 4.5v2.1H7.7v3.2h2.8V21h3.6Z" /></svg>;
  return <svg className={styles.instagramMark} viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.6" cy="6.7" r=".9" /></svg>;
}

function Actions({ platform }: { platform: SocialPlatform }) {
  if (platform === "linkedin") return <div className={styles.linkedinActions} aria-hidden="true"><span><ThumbIcon />Like</span><span><CommentIcon />Comment</span><span><RepostIcon />Repost</span><span><SendIcon />Send</span></div>;
  if (platform === "facebook") return <div className={styles.facebookActions} aria-hidden="true"><span><ThumbIcon />Like</span><span><CommentIcon />Comment</span><span><SendIcon />Share</span></div>;
  return <div className={styles.instagramActions} aria-hidden="true"><span><HeartIcon /><CommentIcon /><SendIcon /></span><SaveIcon /></div>;
}

function PostMedia({ audienceId, index, platform }: { audienceId: AudienceId; index: number; platform: SocialPlatform }) {
  const audience = audiences[audienceId];
  const post = audience.socialPosts[index];
  const mediaShape = platform === "instagram" || !post.image ? styles.squareMedia : styles.wideMedia;
  return <div className={`${styles.media} ${mediaShape}`}>
    {post.image ? <Image src={post.image} alt={post.imageAlt ?? "Illustrative example image"} fill sizes="(max-width: 780px) 92vw, 560px" /> : <div className={`${styles.graphicMedia} ${audienceId === "healthcare" ? styles.healthcareGraphic : ""}`}>
      <span>{post.visualKicker}</span><strong>{post.visualTitle}</strong>
      {post.visualDetails && <ul>{post.visualDetails.map((detail) => <li key={detail}>{detail}</li>)}</ul>}
    </div>}
  </div>;
}

function More() { return <span className={styles.more}><MoreIcon /></span>; }

/** Static social feed mock-ups. Only the platform and post selectors are interactive. */
export const SocialPostPreview = memo(function SocialPostPreview({ audienceId, compact = false }: { audienceId: AudienceId; compact?: boolean }) {
  const audience = audiences[audienceId];
  const [platform, setPlatform] = useState<SocialPlatform>(audienceId === "hospitality" ? "instagram" : "linkedin");
  const [postIndex, setPostIndex] = useState(0);

  const post = audience.socialPosts[postIndex];
  return <div className={`${styles.preview} ${compact ? styles.compact : ""}`}>
    <div className={styles.previewControls}>
      <span>Choose a feed</span>
      <div role="group" aria-label="Choose a social platform" className={styles.platforms}>
        {platforms.map((option) => <button type="button" key={option.id} onClick={() => setPlatform(option.id)} aria-pressed={platform === option.id}><PlatformMark platform={option.id} />{option.label}</button>)}
      </div>
    </div>
    <div className={styles.postControls} role="group" aria-label="Choose an illustrative post">
      {audience.socialPosts.map((example, index) => <button type="button" key={example.format} aria-pressed={postIndex === index} onClick={() => setPostIndex(index)}>{example.selector}</button>)}
    </div>
    <article className={`${styles.feedCard} ${styles[platform]}`} aria-label={`Illustrative ${platform} post for ${audience.label}`}>
      {platform === "instagram" && <>
        <header className={styles.instagramHeader}><span className={styles.avatar}>{audience.socialProfile.initials}</span><div><strong>{audience.socialProfile.handle}</strong><small>{post.format}</small></div><More /></header>
        <PostMedia audienceId={audienceId} index={postIndex} platform={platform} />
        <Actions platform={platform} />
        <div className={styles.caption}><strong>{audience.socialProfile.handle}</strong> {post.caption}{post.cta && <span> Find details via the link in our bio.</span>}</div>
        <span className={styles.feedDisclosure}>Illustrative post preview</span>
      </>}
      {platform === "facebook" && <>
        <header className={styles.facebookHeader}><span className={styles.avatar}>{audience.socialProfile.initials}</span><div><strong>{audience.socialProfile.name}</strong><small>Illustrative post <span aria-hidden="true">·</span> <GlobeIcon /></small></div><More /></header>
        <p className={styles.facebookCaption}>{post.caption}</p>
        <PostMedia audienceId={audienceId} index={postIndex} platform={platform} />
        {post.cta && <div className={styles.linkPreview}><span>{post.format}</span><strong>{post.title}</strong><span>{post.cta} <b aria-hidden="true">↗</b></span></div>}
        <Actions platform={platform} />
        <span className={styles.feedDisclosure}>Illustrative post preview</span>
      </>}
      {platform === "linkedin" && <>
        <header className={styles.linkedinHeader}><span className={styles.avatar}>{audience.socialProfile.initials}</span><div><strong>{audience.socialProfile.name}</strong><small>Illustrative post <span aria-hidden="true">·</span> <GlobeIcon /> Public</small></div><More /></header>
        <p className={styles.linkedinCaption}>{post.caption}</p>
        <PostMedia audienceId={audienceId} index={postIndex} platform={platform} />
        {post.cta && <div className={styles.linkPreview}><span>{post.format}</span><strong>{post.title}</strong><span>{post.cta} <b aria-hidden="true">↗</b></span></div>}
        <Actions platform={platform} />
        <span className={styles.feedDisclosure}>Illustrative post preview</span>
      </>}
    </article>
  </div>;
});
