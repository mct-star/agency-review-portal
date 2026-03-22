"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import LinkedInPreview from "@/components/content/LinkedInPreview";
import VoiceDictation from "@/components/ui/VoiceDictation";

/**
 * Quick Generate — the "make me a post" experience.
 *
 * Lives on the dashboard. User picks a company, a person (spokesperson),
 * a topic, post type, and platform, hits generate, and gets copy-ready
 * content with an image.
 */

interface PostTypeOption {
  slug: string;
  label: string;
  description: string;
  archetype: string;
  color: string;
}

const POST_TYPES: PostTypeOption[] = [
  {
    slug: "insight",
    label: "Problem Diagnosis",
    description: "Identify a common mistake your audience makes. 150-250 words.",
    archetype: "quote_card_green",
    color: "#CDD856",
  },
  {
    slug: "launch_story",
    label: "Experience Story",
    description: "Share a real experience with pattern recognition. 200-350 words.",
    archetype: "pixar_healthcare",
    color: "#41CDA9",
  },
  {
    slug: "if_i_was",
    label: "Expert Perspective",
    description: "\"If I was in your role...\" practical advice. 200-300 words.",
    archetype: "quote_card_purple",
    color: "#A27BF9",
  },
  {
    slug: "contrarian",
    label: "Contrarian Take",
    description: "Challenge a widely-held industry assumption. 200-300 words.",
    archetype: "quote_card_blue",
    color: "#41C9FE",
  },
  {
    slug: "tactical",
    label: "Tactical How-To",
    description: "Actionable steps to solve a specific problem. 150-250 words.",
    archetype: "carousel",
    color: "#CDD856",
  },
  {
    slug: "founder_friday",
    label: "Personal Reflection",
    description: "Behind the scenes: expectations vs reality. 250-400 words.",
    archetype: "pixar_fantasy",
    color: "#F59E0B",
  },
  {
    slug: "blog_teaser",
    label: "Article Teaser",
    description: "Drive traffic to a longer piece of content. 60-120 words.",
    archetype: "quote_card",
    color: "#059669",
  },
  {
    slug: "personal_update",
    label: "Personal Update",
    description: "Share what you're up to. Candid, human, relatable. 100-200 words.",
    archetype: "editorial_photo",
    color: "#E11D48",
  },
];

interface CompanyOption {
  id: string;
  name: string;
  authorName: string;
  authorTagline: string;
  brandColor: string;
  profilePictureUrl?: string | null;
}

interface SpokespersonOption {
  id: string;
  companyId: string;
  name: string;
  tagline: string;
  profilePictureUrl: string | null;
  isPrimary: boolean;
}

interface PlatformOption {
  id: string;
  label: string;
  icon: string; // SVG path
  viewBox?: string;
}

const PLATFORMS: PlatformOption[] = [
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: "M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z",
  },
  {
    id: "x",
    label: "X",
    icon: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
  {
    id: "bluesky",
    label: "Bluesky",
    icon: "M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.785 2.627 3.59 3.501 6.128 3.462-3.529.105-6.507 1.272-3.44 4.665C6.356 21.597 9.652 22 12 17.248c2.348 4.752 5.644 4.349 8.688 1.126 3.067-3.393.089-4.56-3.44-4.665 2.539.039 5.343-.835 6.128-3.462C23.622 9.418 24 4.458 24 3.768c0-.688-.139-1.86-.902-2.203-.659-.3-1.664-.621-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z",
  },
  {
    id: "threads",
    label: "Threads",
    icon: "M12.186 24h-.007C5.965 23.97 2.2 19.98 2.2 14.07v-.2c.09-5.63 3.52-9.78 8.94-10.84a10.27 10.27 0 0 1 5.43.46 7.63 7.63 0 0 1 4.21 4.47l-1.85.85a5.84 5.84 0 0 0-3.22-3.42 8.29 8.29 0 0 0-4.37-.37c-4.44.87-7.19 4.27-7.28 8.98v.18c.06 4.73 2.87 7.95 7.32 8.37a8.67 8.67 0 0 0 5.25-1.14 5.64 5.64 0 0 0 2.62-4.55c-.04-1.68-.73-2.97-2.06-3.83a6.87 6.87 0 0 0-1.18-.62 13.48 13.48 0 0 1-.08 1.67c-.14 1.07-.5 1.98-1.06 2.69a3.55 3.55 0 0 1-2.75 1.31 3.45 3.45 0 0 1-2.63-.96 3.15 3.15 0 0 1-.81-2.42c.08-1.56.93-2.78 2.4-3.42a6.6 6.6 0 0 1 2.68-.54l.14.01c-.03-.48-.12-.94-.27-1.37a2.6 2.6 0 0 0-2.07-1.7 4.54 4.54 0 0 0-2.47.24l-.66-1.8a6.53 6.53 0 0 1 3.48-.36 4.5 4.5 0 0 1 3.52 2.93c.2.55.34 1.13.41 1.73a8.4 8.4 0 0 1 1.83.95c1.86 1.2 2.84 3.02 2.9 5.4a7.63 7.63 0 0 1-3.51 6.14A10.64 10.64 0 0 1 12.186 24zM11.4 15.42c-.52.08-.98.24-1.35.45-.83.47-1.27 1.13-1.31 1.95a1.24 1.24 0 0 0 .32.93c.29.3.72.46 1.18.44a1.6 1.6 0 0 0 1.27-.59c.37-.48.61-1.14.71-1.96.04-.3.06-.61.07-.93a4.7 4.7 0 0 0-.89-.29z",
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z",
  },
  {
    id: "tiktok",
    label: "TikTok",
    icon: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  },
];

// Platform brand colours for selected state
const PLATFORM_COLORS: Record<string, string> = {
  linkedin: "#0A66C2",
  x: "#000000",
  bluesky: "#0085FF",
  threads: "#000000",
  facebook: "#1877F2",
  instagram: "#E4405F",
  tiktok: "#000000",
};

interface QuickGenerateProps {
  companies: CompanyOption[];
  spokespersons?: SpokespersonOption[];
  showCompanyPicker?: boolean;
  initialTopic?: string;
  initialPostType?: string;
}

type GenerationState = "idle" | "generating" | "complete" | "error";

interface GeneratedResult {
  postText: string;
  firstComment: string | null;
  imageUrl: string | null;
  carouselImageUrls?: string[] | null;
  postType: string;
}

export default function QuickGenerate({
  companies,
  spokespersons = [],
  initialTopic,
  initialPostType,
  showCompanyPicker = false,
}: QuickGenerateProps) {
  const [selectedCompany, setSelectedCompany] = useState<CompanyOption>(companies[0]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [topic, setTopic] = useState(initialTopic || "");
  const [selectedPostType, setSelectedPostType] = useState<PostTypeOption | null>(
    initialPostType ? POST_TYPES.find((p) => p.slug === initialPostType) || null : null
  );
  const [platform, setPlatform] = useState("linkedin");
  const [state, setState] = useState<GenerationState>("idle");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [applyingOverlay, setApplyingOverlay] = useState(false);
  const [overlayError, setOverlayError] = useState<string | null>(null);
  const [linkedInConnected, setLinkedInConnected] = useState(false);
  const [linkedInExpired, setLinkedInExpired] = useState(false);
  const [linkedInAccountName, setLinkedInAccountName] = useState<string | null>(null);
  const [blueskyConnected, setBlueskyConnected] = useState(false);
  const [blueskyAccountName, setBlueskyAccountName] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [postUrl, setPostUrl] = useState<string | null>(null);
  const [blueskyPostUrl, setBlueskyPostUrl] = useState<string | null>(null);
  const [publishToLinkedIn, setPublishToLinkedIn] = useState(true);
  const [publishToBluesky, setPublishToBluesky] = useState(true);
  const [imagePrompt, setImagePrompt] = useState<string | null>(null);
  const [regeneratingImage, setRegeneratingImage] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [editedFirstComment, setEditedFirstComment] = useState("");

  // Add to week
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const [addingToWeek, setAddingToWeek] = useState(false);
  const [addedToWeek, setAddedToWeek] = useState<string | null>(null);

  // Topic picker from content strategy
  const [strategyTopics, setStrategyTopics] = useState<{ id: string; topic: string; pillar?: string; theme?: string; month?: string }[]>([]);
  const [showTopicPicker, setShowTopicPicker] = useState(false);

  // Filter spokespersons for the selected company
  const companyPeople = useMemo(
    () => spokespersons.filter((s) => s.companyId === selectedCompany.id),
    [spokespersons, selectedCompany.id]
  );

  // Selected person (or primary fallback)
  const selectedPerson = useMemo(() => {
    if (selectedPersonId) return companyPeople.find((p) => p.id === selectedPersonId) || null;
    return companyPeople.find((p) => p.isPrimary) || companyPeople[0] || null;
  }, [companyPeople, selectedPersonId]);

  // Author info for preview — use selected person if available, otherwise company defaults
  const authorName = selectedPerson?.name || selectedCompany.authorName;
  const authorTagline = selectedPerson?.tagline || selectedCompany.authorTagline;
  const authorAvatar = selectedPerson?.profilePictureUrl || selectedCompany.profilePictureUrl;

  // Check which social platforms are connected
  useEffect(() => {
    let cancelled = false;
    async function check() {
      // LinkedIn
      try {
        const res = await fetch(`/api/publish/linkedin-direct?companyId=${selectedCompany.id}`);
        const data = await res.json();
        if (!cancelled) {
          setLinkedInConnected(data.connected === true);
          setLinkedInExpired(data.expired === true);
          setLinkedInAccountName(data.accountName || null);
        }
      } catch {
        if (!cancelled) { setLinkedInConnected(false); setLinkedInExpired(false); }
      }
      // Bluesky
      try {
        const res = await fetch(`/api/config/social-accounts?companyId=${selectedCompany.id}`);
        const data = await res.json();
        const bskyAccount = (data.data || []).find((a: { platform: string; account_name?: string }) => a.platform === "bluesky");
        if (!cancelled) {
          setBlueskyConnected(!!bskyAccount);
          setBlueskyAccountName(bskyAccount?.account_name || null);
        }
      } catch {
        if (!cancelled) { setBlueskyConnected(false); }
      }
    }
    check();
    return () => { cancelled = true; };
  }, [selectedCompany.id]);

  async function handlePublish() {
    if (!result) return;
    setPublishing(true);
    setPublishError(null);

    const errors: string[] = [];

    // Publish to LinkedIn
    if (publishToLinkedIn && linkedInConnected) {
      try {
        const res = await fetch("/api/publish/linkedin-direct", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: selectedCompany.id,
            text: livePostText,
            firstComment: liveFirstComment || undefined,
            imageUrl: currentImageUrl || undefined,
            carouselImageUrls: result.carouselImageUrls || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "LinkedIn publish failed");
        setPostUrl(data.post?.url || null);
      } catch (err) {
        errors.push(`LinkedIn: ${err instanceof Error ? err.message : "failed"}`);
      }
    }

    // Publish to Bluesky
    if (publishToBluesky && blueskyConnected) {
      try {
        const res = await fetch("/api/publish/bluesky", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: selectedCompany.id,
            text: livePostText,
            imageUrl: currentImageUrl || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Bluesky publish failed");
        setBlueskyPostUrl(data.post?.url || null);
      } catch (err) {
        errors.push(`Bluesky: ${err instanceof Error ? err.message : "failed"}`);
      }
    }

    if (errors.length > 0) {
      setPublishError(errors.join(". "));
    }
    if (errors.length === 0) {
      setPublished(true);
    }
    setPublishing(false);
  }

  async function handleRegenerateImage() {
    if (!selectedPostType) return;
    setRegeneratingImage(true);
    setOverlayError(null);
    try {
      const archetype = selectedPostType.archetype;

      // For quote cards and carousels, regenerate the whole post
      // (the image is programmatic and tied to the content)
      if (archetype === "quote_card" || archetype === "carousel") {
        // Re-run the full generation to get a new programmatic image
        const res = await fetch("/api/generate/quick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: selectedCompany.id,
            spokespersonId: selectedPerson?.id || null,
            topic: topic.trim() || "industry insight",
            postTypeSlug: selectedPostType.slug,
            platform,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Regeneration failed");
        if (data.imageUrl) {
          setCurrentImageUrl(data.imageUrl);
        }
        // Update the post text too since it's a fresh generation
        if (data.postText && result) {
          setResult({
            ...result,
            postText: data.postText,
            firstComment: data.firstComment || null,
            imageUrl: data.imageUrl || null,
            carouselImageUrls: data.carouselImageUrls || null,
          });
        }
      } else {
        // For AI-generated images, call the image-only endpoint
        if (!imagePrompt) return;
        const aspectRatio = archetype.includes("pixar") ? "4:3" : "1:1";
        const res = await fetch("/api/generate/quick-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: selectedCompany.id,
            imagePrompt,
            archetype,
            aspectRatio,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Image regeneration failed");
        if (data.imageUrl) {
          setCurrentImageUrl(data.imageUrl);
        }
      }
    } catch (err) {
      setOverlayError(err instanceof Error ? err.message : "Image regeneration failed");
    } finally {
      setRegeneratingImage(false);
    }
  }

  async function handleGenerate() {
    if (!topic.trim() || !selectedPostType) return;
    setState("generating");
    setError(null);
    setResult(null);
    setProgress("Creating content...");

    try {
      const contentRes = await fetch("/api/generate/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompany.id,
          spokespersonId: selectedPerson?.id || null,
          topic: topic.trim(),
          postTypeSlug: selectedPostType.slug,
          platform,
        }),
      });

      if (!contentRes.ok) {
        const err = await contentRes.json();
        if (err.limitReached) {
          setError(`You've used ${err.used} of ${err.limit} posts this month. Upgrade to Pro for unlimited content generation.`);
          setLimitReached(true);
          setState("error");
          return;
        }
        throw new Error(err.error || "Content generation failed");
      }

      const data = await contentRes.json();

      const generated: GeneratedResult = {
        postText: data.postText,
        firstComment: data.firstComment,
        imageUrl: data.imageUrl || null,
        carouselImageUrls: data.carouselImageUrls || null,
        postType: selectedPostType.slug,
      };

      setResult(generated);
      setEditedText(data.postText);
      setEditedFirstComment(data.firstComment || "");
      setCurrentImageUrl(generated.imageUrl);
      setImagePrompt(data.imagePrompt || null);
      setEditing(false);
      setAddedToWeek(null);
      setState("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("error");
    }
  }

  // Get the live text (edited or original)
  const livePostText = editing ? editedText : (result?.postText || "");
  const liveFirstComment = editing ? editedFirstComment : (result?.firstComment || "");

  function handleStartEdit() {
    if (!result) return;
    setEditedText(result.postText);
    setEditedFirstComment(result.firstComment || "");
    setEditing(true);
  }

  function handleSaveEdit() {
    if (!result) return;
    setResult({
      ...result,
      postText: editedText,
      firstComment: editedFirstComment || null,
    });
    setEditing(false);
  }

  function handleCancelEdit() {
    if (!result) return;
    setEditedText(result.postText);
    setEditedFirstComment(result.firstComment || "");
    setEditing(false);
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(livePostText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopyFirstComment() {
    if (!liveFirstComment) return;
    await navigator.clipboard.writeText(liveFirstComment);
  }

  // Add to week — save the post as a content piece assigned to a week
  async function handleAddToWeek(weekNumber: number) {
    if (!result) return;
    setAddingToWeek(true);
    try {
      const res = await fetch("/api/content/pieces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompany.id,
          spokespersonId: selectedPerson?.id || null,
          weekNumber,
          postType: result.postType,
          platform,
          title: topic,
          markdownBody: livePostText,
          firstComment: liveFirstComment || null,
          imageUrl: currentImageUrl || null,
          carouselImageUrls: result.carouselImageUrls || null,
          status: "draft",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      setAddedToWeek(`Week ${weekNumber}`);
      setShowWeekPicker(false);
    } catch (err) {
      console.error("Add to week failed:", err);
    } finally {
      setAddingToWeek(false);
    }
  }

  // Fetch strategy topics for the topic picker
  useEffect(() => {
    async function fetchTopics() {
      try {
        const res = await fetch(`/api/content/strategy-topics?companyId=${selectedCompany.id}&scope=month`);
        if (res.ok) {
          const data = await res.json();
          setStrategyTopics(data.topics || []);
        }
      } catch {
        // Non-critical — topic picker just won't show
      }
    }
    fetchTopics();
  }, [selectedCompany.id]);

  async function handleApplyOverlay() {
    if (!currentImageUrl) return;
    setApplyingOverlay(true);
    setOverlayError(null);
    try {
      const res = await fetch("/api/generate/overlay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: currentImageUrl, companyId: selectedCompany.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Overlay failed");
      if (json.url) {
        setCurrentImageUrl(json.url);
      } else {
        throw new Error("No URL returned from overlay");
      }
    } catch (err) {
      setOverlayError(err instanceof Error ? err.message : "Overlay failed");
    } finally {
      setApplyingOverlay(false);
    }
  }

  function handleReset() {
    setState("idle");
    setResult(null);
    setCurrentImageUrl(null);
    setError(null);
    setProgress("");
    setPublished(false);
    setPublishError(null);
    setPostUrl(null);
    setImagePrompt(null);
    setRegeneratingImage(false);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Removed: duplicate header — page title already shown above */}

      {state === "idle" || state === "error" ? (
        <div className="p-6 space-y-5">
          {/* Company + Person selector */}
          {showCompanyPicker ? (
            /* Admin view: two separate dropdowns */
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Company
                </label>
                <select
                  value={selectedCompany.id}
                  onChange={(e) => {
                    const c = companies.find((co) => co.id === e.target.value);
                    if (c) {
                      setSelectedCompany(c);
                      setSelectedPersonId(null);
                    }
                  }}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Posting as
                </label>
                {companyPeople.length > 0 ? (
                  <select
                    value={selectedPerson?.id || ""}
                    onChange={(e) => setSelectedPersonId(e.target.value || null)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  >
                    {companyPeople.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.isPrimary ? " (Primary)" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-500">
                    {selectedCompany.authorName}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Client view: single combined dropdown with brand page + people */
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Posting as
              </label>
              <select
                value={selectedPersonId || "__company__"}
                onChange={(e) => {
                  if (e.target.value === "__company__") {
                    setSelectedPersonId(null);
                  } else {
                    setSelectedPersonId(e.target.value);
                  }
                }}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <optgroup label="Brand Page">
                  <option value="__company__">{selectedCompany.name} (Company Page)</option>
                </optgroup>
                {companyPeople.length > 0 && (
                  <optgroup label="People">
                    {companyPeople.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.isPrimary ? " (Primary)" : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}

          {/* Selected person/brand preview */}
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-2.5">
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-gray-200">
              {authorAvatar ? (
                <img src={authorAvatar} alt={authorName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gray-200 text-[10px] font-bold text-gray-500">
                  {authorName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{authorName}</p>
              <p className="text-[11px] text-gray-500">{authorTagline}</p>
            </div>
            {!selectedPersonId && !showCompanyPicker && (
              <span className="ml-auto rounded bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600">Company Page</span>
            )}
          </div>

          {/* Topic input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">
                What do you want to post about?
              </label>
              <div className="flex items-center gap-2">
                {strategyTopics.length > 0 && (
                  <button
                    onClick={() => setShowTopicPicker(!showTopicPicker)}
                    className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-100 transition-colors"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                    This month&apos;s topics
                  </button>
                )}
                <VoiceDictation
                  onTranscription={(text) => setTopic((prev) => (prev ? prev + " " + text : text))}
                  companyId={selectedCompany.id}
                  placeholder="Dictate"
                />
              </div>
            </div>

            {/* Topic picker from content strategy */}
            {showTopicPicker && strategyTopics.length > 0 && (
              <div className="mb-2 rounded-lg border border-violet-200 bg-violet-50/50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-500">
                    Topics for {new Date().toLocaleString("default", { month: "long" })}
                  </p>
                  <button
                    onClick={() => setShowTopicPicker(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {strategyTopics.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setTopic(t.topic); setShowTopicPicker(false); }}
                      className="block w-full rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-violet-100 hover:text-violet-800 transition-colors"
                    >
                      <span className="font-medium">{t.topic}</span>
                      {(t.pillar || t.theme) && (
                        <span className="ml-2 text-[10px] text-gray-400">
                          {[t.pillar, t.theme].filter(Boolean).join(" / ")}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Why most healthcare product launches fail in the first 90 days..."
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
            />
          </div>

          {/* Post type selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Post type
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {POST_TYPES.map((pt) => (
                <button
                  key={pt.slug}
                  onClick={() => setSelectedPostType(pt)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                    selectedPostType?.slug === pt.slug
                      ? "border-violet-500 bg-violet-50 ring-1 ring-violet-500"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: pt.color }}
                    />
                    <span className="text-sm font-medium text-gray-900">
                      {pt.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 line-clamp-2">
                    {pt.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Platform selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Platform
            </label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => {
                const isSelected = platform === p.id;
                const brandColor = PLATFORM_COLORS[p.id] || "#6B7280";
                return (
                  <button
                    key={p.id}
                    onClick={() => setPlatform(p.id)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                      isSelected
                        ? "border-gray-900 bg-gray-50"
                        : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    }`}
                    style={isSelected ? { borderColor: brandColor, backgroundColor: `${brandColor}08` } : undefined}
                  >
                    <svg
                      className="h-4 w-4 shrink-0"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      style={isSelected ? { color: brandColor } : undefined}
                    >
                      <path d={p.icon} />
                    </svg>
                    <span style={isSelected ? { color: brandColor } : undefined}>
                      {p.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className={`rounded-lg px-4 py-3 text-sm ${limitReached ? "bg-violet-50 text-violet-800 border border-violet-200" : "bg-red-50 text-red-700"}`}>
              <p>{error}</p>
              {limitReached && (
                <a
                  href={`/setup/${selectedCompany.id}#billing`}
                  className="mt-2 inline-block rounded-md bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 transition-colors"
                >
                  Upgrade to Pro
                </a>
              )}
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!topic.trim() || !selectedPostType}
            className="w-full rounded-lg bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Generate Post
          </button>
        </div>
      ) : state === "generating" ? (
        <div className="flex flex-col items-center justify-center p-12">
          <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
          <p className="text-sm font-medium text-gray-900">{progress}</p>
          <p className="mt-1 text-xs text-gray-500">This usually takes 15-30 seconds</p>
        </div>
      ) : state === "complete" && result ? (
        <div className="p-6 space-y-6">
          {/* Action bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-sm font-medium text-green-700">Post generated</span>
            </div>
            <div className="flex gap-2">
              {/* Edit / Save / Cancel */}
              {!editing ? (
                <button
                  onClick={handleStartEdit}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Edit
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSaveEdit}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors"
                  >
                    Save edits
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              )}
              <button
                onClick={handleCopy}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {copied ? "Copied!" : "Copy text"}
              </button>
              {currentImageUrl && (
                <a
                  href={currentImageUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Download image
                </a>
              )}
              {currentImageUrl && imagePrompt && (
                <button
                  onClick={handleRegenerateImage}
                  disabled={regeneratingImage}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {regeneratingImage ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Regenerating...
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 4v6h6M23 20v-6h-6" />
                        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                      </svg>
                      New image
                    </span>
                  )}
                </button>
              )}
              {currentImageUrl && (
                <button
                  onClick={handleApplyOverlay}
                  disabled={applyingOverlay}
                  className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  {applyingOverlay ? "Applying..." : "Apply overlay"}
                </button>
              )}
              {/* Multi-platform publish */}
              {!published && (linkedInConnected || blueskyConnected) && (
                <div className="flex items-center gap-2">
                  {/* Platform checkboxes */}
                  {linkedInConnected && (
                    <label className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-colors ${publishToLinkedIn ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-400"}`}>
                      <input type="checkbox" checked={publishToLinkedIn} onChange={(e) => setPublishToLinkedIn(e.target.checked)} className="sr-only" />
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
                      </svg>
                      {publishToLinkedIn ? "✓" : ""} LinkedIn
                    </label>
                  )}
                  {blueskyConnected && (
                    <label className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-colors ${publishToBluesky ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-400"}`}>
                      <input type="checkbox" checked={publishToBluesky} onChange={(e) => setPublishToBluesky(e.target.checked)} className="sr-only" />
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" />
                      </svg>
                      {publishToBluesky ? "✓" : ""} Bluesky
                    </label>
                  )}
                  {/* Publish button */}
                  <button
                    onClick={handlePublish}
                    disabled={publishing || (!publishToLinkedIn && !publishToBluesky)}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {publishing ? (
                      <span className="flex items-center gap-1.5">
                        <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Publishing...
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                        </svg>
                        Publish
                      </span>
                    )}
                  </button>
                </div>
              )}
              {!published && !linkedInConnected && !blueskyConnected && (
                <a
                  href={`/setup/${selectedCompany.id}/social`}
                  className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  Connect social accounts →
                </a>
              )}
              {/* Post-publish links */}
              {published && (
                <div className="flex items-center gap-2">
                  {postUrl && (
                    <a href={postUrl} target="_blank" rel="noopener noreferrer" className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors">
                      View on LinkedIn ↗
                    </a>
                  )}
                  {blueskyPostUrl && (
                    <a href={blueskyPostUrl} target="_blank" rel="noopener noreferrer" className="rounded-md px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-colors" style={{ backgroundColor: "#0085FF" }}>
                      View on Bluesky ↗
                    </a>
                  )}
                  {!postUrl && !blueskyPostUrl && (
                    <span className="rounded-md bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700">Published</span>
                  )}
                </div>
              )}
              {/* Edit button */}
              {!editing ? (
                <button
                  onClick={handleStartEdit}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Edit
                  </span>
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSaveEdit}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors"
                  >
                    Save edits
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              )}

              {/* Add to week button */}
              {!addedToWeek ? (
                <div className="relative">
                  <button
                    onClick={() => setShowWeekPicker(!showWeekPicker)}
                    className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                        <line x1="12" y1="14" x2="12" y2="18" />
                        <line x1="10" y1="16" x2="14" y2="16" />
                      </svg>
                      Add to week
                    </span>
                  </button>
                  {showWeekPicker && (
                    <div className="absolute right-0 top-full mt-1 z-10 rounded-lg border border-gray-200 bg-white shadow-lg p-2 min-w-[160px]">
                      <p className="px-2 py-1 text-[10px] font-semibold uppercase text-gray-400">Select week</p>
                      {(() => {
                        const now = new Date();
                        const currentWeek = Math.ceil(
                          (now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)
                        );
                        return Array.from({ length: 6 }, (_, i) => currentWeek + i).map((w) => (
                          <button
                            key={w}
                            onClick={() => handleAddToWeek(w)}
                            disabled={addingToWeek}
                            className="block w-full rounded px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-violet-50 hover:text-violet-700 transition-colors disabled:opacity-50"
                          >
                            Week {w} {w === currentWeek ? "(this week)" : w === currentWeek + 1 ? "(next week)" : ""}
                          </button>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <span className="rounded-md bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700">
                  <span className="flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Added to {addedToWeek}
                  </span>
                </span>
              )}

              <button
                onClick={handleReset}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                New post
              </button>
            </div>
          </div>

          {/* Publish error */}
          {publishError && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              LinkedIn publish error: {publishError}
            </div>
          )}

          {/* Overlay error */}
          {overlayError && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              Overlay error: {overlayError}
            </div>
          )}

          {/* Carousel Slides Strip (when carousel images are available) */}
          {result.carouselImageUrls && result.carouselImageUrls.length > 1 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase text-gray-400">
                  Carousel Slides ({result.carouselImageUrls.length})
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCarouselIndex(Math.max(0, carouselIndex - 1))}
                    disabled={carouselIndex === 0}
                    className="rounded p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                  </button>
                  <span className="text-xs text-gray-500">{carouselIndex + 1}/{result.carouselImageUrls.length}</span>
                  <button
                    onClick={() => setCarouselIndex(Math.min(result.carouselImageUrls!.length - 1, carouselIndex + 1))}
                    disabled={carouselIndex >= result.carouselImageUrls.length - 1}
                    className="rounded p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                  </button>
                </div>
              </div>
              {/* Thumbnail strip */}
              <div className="flex gap-2 overflow-x-auto pb-2">
                {result.carouselImageUrls.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => { setCarouselIndex(i); setCurrentImageUrl(url); }}
                    className={`flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                      i === carouselIndex ? "border-violet-500 shadow-md" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <img src={url} alt={`Slide ${i + 1}`} className="h-20 w-20 object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Edit mode: inline text editor */}
          {editing ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-violet-200 bg-violet-50/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="h-4 w-4 text-violet-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  <h3 className="text-xs font-semibold uppercase text-violet-600">Edit Post Text</h3>
                </div>
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  rows={12}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <p className="mt-1 text-[10px] text-gray-400">{editedText.length} characters</p>
              </div>
              {result.firstComment !== null && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <h3 className="text-xs font-semibold uppercase text-gray-400 mb-2">Edit First Comment</h3>
                  <textarea
                    value={editedFirstComment}
                    onChange={(e) => setEditedFirstComment(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
              )}
            </div>
          ) : (
            <>
              {/* LinkedIn Preview */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <LinkedInPreview
                  authorName={authorName}
                  authorTagline={authorTagline}
                  authorAvatarUrl={authorAvatar || undefined}
                  postText={livePostText}
                  firstComment={liveFirstComment}
                  postType={result.postType}
                  imageUrl={currentImageUrl}
                  brandColor={selectedCompany.brandColor}
                />
              </div>

              {/* First comment (copyable) */}
              {liveFirstComment && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase text-gray-400">
                      First Comment
                    </h3>
                    <button
                      onClick={handleCopyFirstComment}
                      className="text-xs text-violet-600 hover:text-violet-700"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {liveFirstComment}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
