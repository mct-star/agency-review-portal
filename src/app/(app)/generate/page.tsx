"use client";

import { useState, useEffect, useCallback } from "react";

interface Company {
  id: string;
  name: string;
  content_strategy_mode: string;
  spokesperson_name: string | null;
}

interface Week {
  id: string;
  week_number: number;
  year: number;
  date_start: string;
  date_end: string;
  pillar: string | null;
  theme: string | null;
  subject: string | null;
  status: string;
}

interface PostType {
  slug: string;
  label: string;
  template_instructions: string | null;
  word_count_min: number | null;
  word_count_max: number | null;
  default_image_archetype: string | null;
}

interface TopicEntry {
  id: string;
  topic_number: number;
  title: string;
  pillar: string | null;
  audience_theme: string | null;
  description: string | null;
  is_used: boolean;
}

interface GenerationStatus {
  phase: "idle" | "preparing" | "generating" | "images" | "translating" | "reviewing" | "complete" | "error";
  current: number;
  total: number;
  currentLabel: string;
  error?: string;
}

interface RegReviewResults {
  totalIssues: number;
  criticalCount: number;
  warningCount: number;
  results: {
    pieceId: string;
    title: string;
    contentType: string;
    overallRisk: string;
    issues: { flag: string; category: string; title: string; description: string; countries: string[]; suggestion: string }[];
    summary: string;
  }[];
}

interface TranslationResults {
  translatedCount: number;
  targetLanguages: string[];
  translations: {
    pieceId: string;
    originalTitle: string;
    language: string;
    languageName: string;
    translatedTitle: string;
    newPieceId?: string;
  }[];
}

type GenerationScope = "single_post" | "single_blog" | "single_article" | "full_week" | "full_month";

type Step = "company" | "scope" | "configure" | "generating";

const SCOPE_OPTIONS: { id: GenerationScope; label: string; description: string; icon: string }[] = [
  {
    id: "single_post",
    label: "Single Social Post",
    description: "Generate one LinkedIn post. Pick a post type and give it a topic.",
    icon: "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z",
  },
  {
    id: "single_blog",
    label: "Blog Article",
    description: "Generate a full blog article with SEO assets and images.",
    icon: "M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z",
  },
  {
    id: "single_article",
    label: "LinkedIn Article",
    description: "Generate a long-form LinkedIn article (newsletter format).",
    icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  },
  {
    id: "full_week",
    label: "Full Week",
    description: "Generate all posts, blog, and article for an entire week from your content calendar.",
    icon: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  },
  {
    id: "full_month",
    label: "Full Month",
    description: "Generate 4 weeks of content in one go from your quarterly calendar.",
    icon: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z",
  },
];

const STEP_LABELS: Record<Step, string> = {
  company: "Company",
  scope: "What to Generate",
  configure: "Configure",
  generating: "Generate",
};

// ─── Date helpers ──────────────────────────────────────
function getWeekSunday(d: Date): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay()); // getDay() === 0 for Sunday
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function toLocalISODate(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function getUpcomingWeekStarts(count: number): string[] {
  const starts: string[] = [];
  const sunday = getWeekSunday(new Date());
  for (let i = 0; i < count; i++) {
    const s = new Date(sunday);
    s.setDate(s.getDate() + i * 7);
    starts.push(toLocalISODate(s));
  }
  return starts;
}

export default function GeneratePage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [postTypes, setPostTypes] = useState<PostType[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedWeekId, setSelectedWeekId] = useState("");
  const [selectedScope, setSelectedScope] = useState<GenerationScope | "">("");
  const [step, setStep] = useState<Step>("company");
  const [generateImages, setGenerateImages] = useState(true);
  const [weekSubject, setWeekSubject] = useState("");
  // Single post config
  const [singleTopic, setSingleTopic] = useState("");
  const [singlePostType, setSinglePostType] = useState("");
  // Week date selection (full-week mode only — Sunday-aligned)
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>("");
  // Single-post specific scheduling (date + time)
  const [singleDate, setSingleDate] = useState<string>(() => {
    // Default to today in local YYYY-MM-DD
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [singleTime, setSingleTime] = useState<string>("09:00");
  // Topic bank
  const [topics, setTopics] = useState<TopicEntry[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [topicMode, setTopicMode] = useState<"bank" | "custom">("bank");
  const [blogTitle, setBlogTitle] = useState<string | null>(null);
  const [blogUrl, setBlogUrl] = useState<string | null>(null);
  // Translation & regulatory
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>(["GB"]);
  const [runRegReview, setRunRegReview] = useState(false);
  const [regReviewResults, setRegReviewResults] = useState<RegReviewResults | null>(null);
  const [translationResults, setTranslationResults] = useState<TranslationResults | null>(null);
  const [status, setStatus] = useState<GenerationStatus>({
    phase: "idle",
    current: 0,
    total: 0,
    currentLabel: "",
  });

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);
  const selectedWeek = weeks.find((w) => w.id === selectedWeekId);
  const isCohesive = selectedCompany?.content_strategy_mode === "cohesive";

  // Fetch companies
  useEffect(() => {
    fetch("/api/companies")
      .then((r) => r.json())
      .then((d) => {
        const list = d.data || [];
        setCompanies(list);
        if (list.length === 1) {
          setSelectedCompanyId(list[0].id);
          setStep("scope");
        }
      });
  }, []);

  // Fetch weeks + post types + topics when company selected
  useEffect(() => {
    if (!selectedCompanyId) return;
    fetch(`/api/weeks?companyId=${selectedCompanyId}`)
      .then((r) => r.json())
      .then((d) => setWeeks(d.data || []));
    fetch(`/api/post-types?companyId=${selectedCompanyId}`)
      .then((r) => r.json())
      .then((d) => setPostTypes(d.data || []))
      .catch(() => setPostTypes([]));
    fetch(`/api/config/topic-bank?companyId=${selectedCompanyId}`)
      .then((r) => r.json())
      .then((d) => setTopics(d.data || []))
      .catch(() => setTopics([]));
  }, [selectedCompanyId]);

  const handleSelectCompany = (id: string) => {
    setSelectedCompanyId(id);
    setSelectedWeekId("");
    setSelectedWeekStart("");
    setSelectedScope("");
    setSelectedTopicId("");
    setSingleTopic("");
    setStep("scope");
  };

  const handleSelectTopic = (topicId: string) => {
    setSelectedTopicId(topicId);
    const topic = topics.find((t) => t.id === topicId);
    if (topic) setSingleTopic(topic.title);
  };

  const handleSelectScope = (scope: GenerationScope) => {
    setSelectedScope(scope);
    setStep("configure");
  };

  // Shared date-tile handler — used by both single post and full-week modes
  const handleSelectWeekDate = (sundayStr: string) => {
    setSelectedWeekStart(sundayStr);
    // Wire up existing calendar week if one aligns with this Sunday
    const match = weeks.find((w) => w.date_start === sundayStr);
    if (match) {
      setSelectedWeekId(match.id);
      setWeekSubject(match.subject || match.theme || "");
    } else {
      setSelectedWeekId("");
      setWeekSubject("");
    }
  };

  // ─── Single piece generation ───────────────────────────
  const handleGenerateSingle = useCallback(async () => {
    setStep("generating");
    setStatus({ phase: "generating", current: 0, total: 1, currentLabel: "Generating your content..." });

    const contentType = selectedScope === "single_blog" ? "blog_article"
      : selectedScope === "single_article" ? "linkedin_article"
      : "social_post";

    try {
      // Resolve week container for this single post.
      // Single posts always go into a "standalone" week container (week_number=0)
      // so they appear grouped by date in the review page.
      let weekId = selectedWeekId;
      if (!weekId) {
        const existingStandalone = weeks.find((w) => w.week_number === 0);
        if (existingStandalone) {
          weekId = existingStandalone.id;
        } else {
          // Create a minimal standalone container using the selected single date
          const postDate = singleDate ? new Date(singleDate + "T00:00:00") : new Date();
          const weekRes = await fetch("/api/weeks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId: selectedCompanyId,
              weekNumber: 0,
              year: postDate.getFullYear(),
              dateStart: toLocalISODate(postDate),
              dateEnd: toLocalISODate(postDate),
              title: "Standalone content",
              status: "draft",
            }),
          });
          if (!weekRes.ok) {
            const text = await weekRes.text();
            throw new Error(`Failed to create content container (${weekRes.status}): ${text.slice(0, 200)}`);
          }
          const weekData = await weekRes.json();
          weekId = weekData.data?.id;
          if (!weekId) throw new Error("Failed to create content container");
        }
      }

      const contentRes: Response = await fetch("/api/generate/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          weekId,
          contentType,
          postTypeSlug: singlePostType || undefined,
          scheduledDate: singleDate || undefined,
          scheduledTime: singleTime || undefined,
          additionalContext: singleTopic ? `TOPIC: ${singleTopic}` : undefined,
        }),
      });

      const contentData = await contentRes.json();
      if (!contentRes.ok) throw new Error(contentData.error || "Generation failed");

      // Generate image if applicable
      if (generateImages && contentData.imagePrompt && contentType === "social_post") {
        setStatus({ phase: "images", current: 0, total: 1, currentLabel: "Generating image…" });
        try {
          const imgRes = await fetch("/api/generate/images", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId: selectedCompanyId,
              contentPieceId: contentData.pieceId,
              prompts: [{
                prompt: typeof contentData.imagePrompt === "string"
                  ? contentData.imagePrompt
                  : contentData.imagePrompt?.prompt || String(contentData.imagePrompt),
                style: "vivid",
                aspectRatio: "1:1",
              }],
            }),
          });
          if (!imgRes.ok) {
            const imgData = await imgRes.json();
            console.warn("Image generation failed:", imgData.error);
          }
        } catch (imgErr) {
          console.warn("Image generation error:", imgErr);
        }
      }

      setSelectedWeekId(weekId);
      setStatus({
        phase: "complete",
        current: 1,
        total: 1,
        currentLabel: `Generated: ${contentData.title}`,
      });
    } catch (err) {
      setStatus({
        phase: "error",
        current: 0,
        total: 1,
        currentLabel: "",
        error: err instanceof Error ? err.message : "Generation failed",
      });
    }
  }, [selectedCompanyId, selectedWeekId, selectedScope, singleTopic, singlePostType, singleDate, singleTime, generateImages, weeks]);

  // ─── Full week generation ──────────────────────────────
  const handleGenerateWeek = useCallback(async () => {
    if (!selectedWeekStart) return;
    setStep("generating");
    setStatus({ phase: "preparing", current: 0, total: 0, currentLabel: "Getting slot assignments..." });

    try {
      // Resolve week ID — use existing calendar entry, or create a new week for this date range
      let resolvedWeekId = selectedWeekId;
      if (!resolvedWeekId) {
        const sunday = new Date(selectedWeekStart + "T00:00:00");
        const saturday = new Date(sunday);
        saturday.setDate(saturday.getDate() + 6);
        const weekRes = await fetch("/api/weeks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: selectedCompanyId,
            weekNumber: 0,
            year: sunday.getFullYear(),
            dateStart: selectedWeekStart,
            dateEnd: toLocalISODate(saturday),
            status: "draft",
          }),
        });
        if (!weekRes.ok) {
          const text = await weekRes.text();
          throw new Error(`Failed to create week (${weekRes.status}): ${text.slice(0, 200)}`);
        }
        const weekData = await weekRes.json();
        resolvedWeekId = weekData.data?.id;
        if (!resolvedWeekId) throw new Error("Failed to create week container");
        setSelectedWeekId(resolvedWeekId);
      }

      const planRes = await fetch("/api/generate/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          weekId: resolvedWeekId,
          mode: isCohesive ? "cohesive" : "variety",
          subject: isCohesive ? weekSubject : undefined,
        }),
      });

      const plan = await planRes.json();
      if (!planRes.ok) throw new Error(plan.error || "Planning failed");

      const assignments = plan.assignments || [];
      const total = assignments.length;
      let piecesCreated = 0;
      let imagesCreated = 0;
      let currentBlogTitle: string | null = null;
      let currentBlogUrl: string | null = null;

      for (let i = 0; i < assignments.length; i++) {
        const assignment = assignments[i];
        setStatus({
          phase: "generating",
          current: i,
          total,
          currentLabel: `Generating ${assignment.slotLabel || assignment.postTypeLabel} (${i + 1}/${total})...`,
        });

        try {
          const contentRes: Response = await fetch("/api/generate/content", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId: selectedCompanyId,
              weekId: resolvedWeekId,
              topicId: assignment.topicId || "auto",
              contentType: ["blog_article", "linkedin_article"].includes(assignment.postTypeSlug)
                ? assignment.postTypeSlug
                : "social_post",
              postTypeSlug: assignment.postTypeSlug,
              postTypeLabel: assignment.postTypeLabel,
              templateInstructions: assignment.templateInstructions,
              wordCountMin: assignment.wordCountMin,
              wordCountMax: assignment.wordCountMax,
              imageArchetype: assignment.imageArchetype,
              ctaUrl: assignment.ctaUrl,
              ctaLinkText: assignment.ctaLinkText,
              dayOfWeek: assignment.dayOfWeek,
              scheduledTime: assignment.scheduledTime,
              slotLabel: assignment.slotLabel,
              ctaTier: assignment.ctaTier || undefined,
              ecosystemRole: assignment.ecosystemRole || undefined,
              blogTitle: currentBlogTitle || undefined,
              blogUrl: currentBlogUrl || undefined,
              additionalContext: assignment.angle
                ? `WEEK SUBJECT: ${weekSubject}\nANGLE FOR THIS POST: ${assignment.angle}`
                : undefined,
            }),
          });

          const contentData = await contentRes.json();
          if (contentRes.ok) {
            piecesCreated++;

            // Capture blog info for ecosystem interlinking
            if (contentData.blogInfo) {
              currentBlogTitle = contentData.blogInfo.blogTitle;
              currentBlogUrl = contentData.blogInfo.blogUrl;
            }

            if (generateImages && contentData.imagePrompt) {
              const isBlogOrArticle = ["blog_article", "linkedin_article"].includes(
                assignment.postTypeSlug
              );
              const archetype = assignment.imageArchetype || "general";
              const ARCHETYPE_STYLES: Record<string, { prefix: string; aspectRatio: string }> = {
                pixar_scenario: { prefix: "Pixar-style 3D animated scene, warm lighting, detailed environment, cinematic composition. ", aspectRatio: "1:1" },
                quote_card: { prefix: "Minimal clean background, subtle gradient, space for text overlay. ", aspectRatio: "1:1" },
                tactical: { prefix: "Clean infographic style, professional diagram or process illustration. ", aspectRatio: "1:1" },
                warm_candid: { prefix: "Warm natural lifestyle photography style, soft lighting, authentic moment. ", aspectRatio: "1:1" },
                before_after: { prefix: "Split composition showing transformation, clear visual contrast. ", aspectRatio: "1:1" },
                general: { prefix: "Pixar-style 3D animated scene, warm lighting, healthcare/business setting. ", aspectRatio: "1:1" },
              };
              const style = ARCHETYPE_STYLES[archetype] || ARCHETYPE_STYLES.general;

              if (isBlogOrArticle && contentData.blogImagePrompts?.length > 0) {
                // Multi-image generation for blog/article content
                const imagePrompts = contentData.blogImagePrompts.map(
                  (bp: { assetType: string; prompt: string }) => {
                    const isCover = bp.assetType === "cover_image_prompt" || bp.assetType === "header_image_prompt";
                    const isHero = bp.assetType === "hero_image_prompt";
                    return {
                      prompt: style.prefix + bp.prompt,
                      style: bp.assetType,
                      aspectRatio: isCover ? "16:9" : isHero ? "4:3" : "1:1",
                    };
                  }
                );

                setStatus({
                  phase: "images",
                  current: i,
                  total,
                  currentLabel: `Generating ${imagePrompts.length} images for ${assignment.slotLabel} (${i + 1}/${total})...`,
                });

                try {
                  const imgRes = await fetch("/api/generate/images", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      companyId: selectedCompanyId,
                      contentPieceId: contentData.pieceId,
                      prompts: imagePrompts,
                    }),
                  });
                  if (imgRes.ok) {
                    const imgData = await imgRes.json();
                    imagesCreated += imgData.imageCount || 0;
                  }
                } catch { /* blog images failed */ }
              } else {
                // Single image for social posts
                setStatus({
                  phase: "images",
                  current: i,
                  total,
                  currentLabel: `Generating image for ${assignment.slotLabel} (${i + 1}/${total})...`,
                });

                try {
                  const enrichedPrompt = typeof contentData.imagePrompt === "string"
                    ? contentData.imagePrompt
                    : contentData.imagePrompt.prompt || String(contentData.imagePrompt);

                  const imgRes = await fetch("/api/generate/images", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      companyId: selectedCompanyId,
                      contentPieceId: contentData.pieceId,
                      prompts: [{ prompt: style.prefix + enrichedPrompt, style: archetype, aspectRatio: style.aspectRatio }],
                    }),
                  });
                  if (imgRes.ok) {
                    imagesCreated++;
                    const imgData = await imgRes.json();
                    if (imgData.images?.[0]?.public_url) {
                      try {
                        await fetch("/api/generate/overlay", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ imageUrl: imgData.images[0].public_url, companyId: selectedCompanyId, contentPieceId: contentData.pieceId, archetype }),
                        });
                      } catch { /* overlay failed */ }
                    }
                  }
                } catch { /* image failed */ }
              }
            }
          }
        } catch { /* piece failed */ }
      }

      if (piecesCreated === 0) {
        setStatus({ phase: "error", current: 0, total, currentLabel: "", error: `Generation failed for all ${total} pieces. Check your Anthropic API key in Setup > API Keys.` });
        return;
      }

      // ── Post-generation: Translation ──
      if (selectedLanguages.length > 0 && resolvedWeekId) {
        setStatus({ phase: "translating", current: 0, total: selectedLanguages.length, currentLabel: `Translating into ${selectedLanguages.length} language${selectedLanguages.length > 1 ? "s" : ""}...` });
        try {
          const transRes = await fetch("/api/generate/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId: selectedCompanyId,
              weekId: resolvedWeekId,
              targetLanguages: selectedLanguages,
              createNewPieces: true,
            }),
          });
          if (transRes.ok) {
            const transData = await transRes.json();
            setTranslationResults(transData);
          }
        } catch {
          console.warn("Translation failed, continuing...");
        }
      }

      // ── Post-generation: Regulatory Review ──
      if (runRegReview && resolvedWeekId) {
        setStatus({ phase: "reviewing", current: 0, total: 1, currentLabel: `Running regulatory review across ${selectedCountries.length} market${selectedCountries.length > 1 ? "s" : ""}...` });
        try {
          const reviewRes = await fetch("/api/review/regulatory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId: selectedCompanyId,
              weekId: resolvedWeekId,
              targetCountries: selectedCountries,
            }),
          });
          if (reviewRes.ok) {
            const reviewData = await reviewRes.json();
            setRegReviewResults(reviewData);
          }
        } catch {
          console.warn("Regulatory review failed, continuing...");
        }
      }

      setStatus({ phase: "complete", current: piecesCreated, total, currentLabel: `Generated ${piecesCreated}/${total} pieces${imagesCreated ? ` + ${imagesCreated} images` : ""}` });
    } catch (err) {
      setStatus({ phase: "error", current: 0, total: 0, currentLabel: "", error: err instanceof Error ? err.message : "Generation failed" });
    }
  }, [selectedCompanyId, selectedWeekId, selectedWeekStart, isCohesive, weekSubject, generateImages, selectedLanguages, runRegReview, selectedCountries]);

  // ─── Full month generation ──────────────────────────────
  const handleGenerateMonth = useCallback(async () => {
    if (!selectedWeekStart) return;
    setStep("generating");
    setStatus({ phase: "preparing", current: 0, total: 0, currentLabel: "Planning 4 weeks..." });

    try {
      const startSunday = new Date(selectedWeekStart + "T00:00:00");
      let totalPieces = 0;
      let completedPieces = 0;

      for (let weekIdx = 0; weekIdx < 4; weekIdx++) {
        const sunday = new Date(startSunday);
        sunday.setDate(sunday.getDate() + weekIdx * 7);
        const saturday = new Date(sunday);
        saturday.setDate(saturday.getDate() + 6);
        const sundayStr = toLocalISODate(sunday);

        setStatus({
          phase: "preparing",
          current: weekIdx,
          total: 4,
          currentLabel: `Planning Week ${weekIdx + 1} of 4 (${formatShortDate(sunday)})...`,
        });

        // Find or create week container
        let resolvedWeekId = weeks.find((w) => w.date_start === sundayStr)?.id;
        if (!resolvedWeekId) {
          const weekRes = await fetch("/api/weeks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId: selectedCompanyId,
              weekNumber: 0,
              year: sunday.getFullYear(),
              dateStart: sundayStr,
              dateEnd: toLocalISODate(saturday),
              status: "draft",
            }),
          });
          if (!weekRes.ok) throw new Error(`Failed to create week ${weekIdx + 1}`);
          const weekData = await weekRes.json();
          resolvedWeekId = weekData.data?.id;
          if (!resolvedWeekId) throw new Error(`No week ID for week ${weekIdx + 1}`);
        }

        // Get plan for this week
        const planRes = await fetch("/api/generate/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: selectedCompanyId,
            weekId: resolvedWeekId,
            mode: isCohesive ? "cohesive" : "variety",
            subject: isCohesive ? weekSubject : undefined,
          }),
        });
        const plan = await planRes.json();
        if (!planRes.ok) throw new Error(plan.error || `Planning failed for week ${weekIdx + 1}`);

        const assignments = plan.assignments || [];
        totalPieces += assignments.length;
        let currentBlogTitle: string | null = null;
        let currentBlogUrl: string | null = null;

        for (let i = 0; i < assignments.length; i++) {
          const assignment = assignments[i];
          completedPieces++;
          setStatus({
            phase: "generating",
            current: completedPieces,
            total: totalPieces,
            currentLabel: `Week ${weekIdx + 1}/4: ${assignment.slotLabel || assignment.postTypeLabel} (${completedPieces}/${totalPieces})`,
          });

          try {
            const contentRes: Response = await fetch("/api/generate/content", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                companyId: selectedCompanyId,
                weekId: resolvedWeekId,
                topicId: assignment.topicId || "auto",
                contentType: ["blog_article", "linkedin_article"].includes(assignment.postTypeSlug) ? assignment.postTypeSlug : "social_post",
                postTypeSlug: assignment.postTypeSlug,
                postTypeLabel: assignment.postTypeLabel,
                templateInstructions: assignment.templateInstructions,
                wordCountMin: assignment.wordCountMin,
                wordCountMax: assignment.wordCountMax,
                imageArchetype: assignment.imageArchetype,
                ctaUrl: assignment.ctaUrl,
                ctaLinkText: assignment.ctaLinkText,
                dayOfWeek: assignment.dayOfWeek,
                scheduledTime: assignment.scheduledTime,
                slotLabel: assignment.slotLabel,
                ctaTier: assignment.ctaTier || undefined,
                ecosystemRole: assignment.ecosystemRole || undefined,
                blogTitle: currentBlogTitle || undefined,
                blogUrl: currentBlogUrl || undefined,
                additionalContext: assignment.angle ? `WEEK SUBJECT: ${weekSubject}\nANGLE FOR THIS POST: ${assignment.angle}` : undefined,
              }),
            });
            const contentData = await contentRes.json();
            if (contentRes.ok && contentData.blogInfo) {
              currentBlogTitle = contentData.blogInfo.blogTitle;
              currentBlogUrl = contentData.blogInfo.blogUrl;
            }

            if (generateImages && contentData.imagePrompt && contentRes.ok) {
              const isBlogOrArticle = ["blog_article", "linkedin_article"].includes(assignment.postTypeSlug);
              try {
                if (isBlogOrArticle && contentData.blogImagePrompts?.length > 0) {
                  // Multi-image for blog/article
                  const imagePrompts = contentData.blogImagePrompts.map(
                    (bp: { assetType: string; prompt: string }) => {
                      const isCover = bp.assetType === "cover_image_prompt" || bp.assetType === "header_image_prompt";
                      const isHero = bp.assetType === "hero_image_prompt";
                      return {
                        prompt: bp.prompt,
                        style: bp.assetType,
                        aspectRatio: isCover ? "16:9" : isHero ? "4:3" : "1:1",
                      };
                    }
                  );
                  await fetch("/api/generate/images", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      companyId: selectedCompanyId,
                      contentPieceId: contentData.pieceId,
                      prompts: imagePrompts,
                    }),
                  });
                } else {
                  // Single image for social posts
                  await fetch("/api/generate/images", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      companyId: selectedCompanyId,
                      contentPieceId: contentData.pieceId,
                      prompts: [{ prompt: typeof contentData.imagePrompt === "string" ? contentData.imagePrompt : String(contentData.imagePrompt), style: assignment.imageArchetype || "general", aspectRatio: "1:1" }],
                    }),
                  });
                }
              } catch { /* image failed, continue */ }
            }
          } catch { /* piece failed, continue */ }
        }
      }

      // ── Post-generation: Translation (all weeks) ──
      if (selectedLanguages.length > 0) {
        setStatus({ phase: "translating", current: 0, total: selectedLanguages.length, currentLabel: `Translating ${completedPieces} pieces into ${selectedLanguages.length} language${selectedLanguages.length > 1 ? "s" : ""}...` });
        // Translate the first week (the one the user selected) — contains all generated content
        const firstWeekId = weeks.find((w) => w.date_start === selectedWeekStart)?.id;
        if (firstWeekId) {
          try {
            const transRes = await fetch("/api/generate/translate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                companyId: selectedCompanyId,
                weekId: firstWeekId,
                targetLanguages: selectedLanguages,
                createNewPieces: true,
              }),
            });
            if (transRes.ok) {
              const transData = await transRes.json();
              setTranslationResults(transData);
            }
          } catch {
            console.warn("Translation failed, continuing...");
          }
        }
      }

      // ── Post-generation: Regulatory Review (all weeks) ──
      if (runRegReview) {
        setStatus({ phase: "reviewing", current: 0, total: 1, currentLabel: `Running regulatory review across ${selectedCountries.length} market${selectedCountries.length > 1 ? "s" : ""}...` });
        const firstWeekId = weeks.find((w) => w.date_start === selectedWeekStart)?.id;
        if (firstWeekId) {
          try {
            const reviewRes = await fetch("/api/review/regulatory", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                companyId: selectedCompanyId,
                weekId: firstWeekId,
                targetCountries: selectedCountries,
              }),
            });
            if (reviewRes.ok) {
              const reviewData = await reviewRes.json();
              setRegReviewResults(reviewData);
            }
          } catch {
            console.warn("Regulatory review failed, continuing...");
          }
        }
      }

      setStatus({
        phase: "complete",
        current: completedPieces,
        total: totalPieces,
        currentLabel: `Generated ${completedPieces} pieces across 4 weeks`,
      });
    } catch (err) {
      setStatus({
        phase: "error",
        current: 0,
        total: 0,
        currentLabel: "",
        error: err instanceof Error ? err.message : "Month generation failed",
      });
    }
  }, [selectedCompanyId, selectedWeekStart, isCohesive, weekSubject, generateImages, weeks, selectedLanguages, runRegReview, selectedCountries]);

  const handleGenerate = selectedScope === "full_month"
    ? handleGenerateMonth
    : selectedScope === "full_week"
    ? handleGenerateWeek
    : handleGenerateSingle;

  const isSingleMode = selectedScope === "single_post" || selectedScope === "single_blog" || selectedScope === "single_article";
  const isWeekMode = selectedScope === "full_week";
  const isMonthMode = selectedScope === "full_month";
  const draftWeeks = weeks.filter((w) => w.status === "draft");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Generate Content</h1>
          <span className="rounded-full bg-gradient-to-r from-purple-500 to-sky-500 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            Copy Magic
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Powered by your content strategy, voice profile, and production-tested atom templates.
        </p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 text-sm">
        {(["company", "scope", "configure", "generating"] as Step[]).map((s, i) => {
          const allSteps: Step[] = ["company", "scope", "configure", "generating"];
          const currentIdx = allSteps.indexOf(step);
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className="h-px w-6 bg-gray-200" />}
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  step === s ? "bg-sky-600 text-white"
                    : currentIdx > i ? "bg-green-500 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {currentIdx > i ? (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : i + 1}
              </div>
              <span className={`text-xs ${step === s ? "font-semibold text-gray-900" : "text-gray-500"}`}>
                {STEP_LABELS[s]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Step 1: Company */}
      {step === "company" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {companies.map((c) => (
            <button
              key={c.id}
              onClick={() => handleSelectCompany(c.id)}
              className="rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-sky-300 hover:bg-sky-50/50"
            >
              <h3 className="font-semibold text-gray-900">{c.name}</h3>
              {c.spokesperson_name && (
                <p className="mt-1 text-sm text-gray-500">{c.spokesperson_name}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Step 2: What to Generate */}
      {step === "scope" && (
        <div className="space-y-3">
          <button onClick={() => setStep("company")} className="text-sm text-gray-400 hover:text-gray-600">
            ← Back to companies
          </button>
          <h2 className="text-lg font-semibold text-gray-900">What would you like to generate?</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {SCOPE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleSelectScope(opt.id)}
                className="group rounded-lg border border-gray-200 bg-white p-5 text-left transition-all hover:border-sky-300 hover:bg-sky-50/30 hover:shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 transition-colors group-hover:bg-sky-100 group-hover:text-sky-600">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d={opt.icon} />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{opt.label}</h3>
                    <p className="mt-1 text-xs text-gray-500 leading-relaxed">{opt.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Configure */}
      {step === "configure" && (
        <div className="space-y-4">
          <button onClick={() => { setStep("scope"); setSelectedScope(""); }} className="text-sm text-gray-400 hover:text-gray-600">
            ← Back to options
          </button>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="font-semibold text-gray-900">
              {SCOPE_OPTIONS.find((o) => o.id === selectedScope)?.label}
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              {SCOPE_OPTIONS.find((o) => o.id === selectedScope)?.description}
            </p>
          </div>

          {/* ── Single post configuration ─── */}
          {isSingleMode && (
            <div className="space-y-3">
              <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-900">Topic or subject</label>

                  {/* Mode toggle — only show if the company has topics loaded */}
                  {topics.length > 0 && (
                    <div className="mt-1.5 flex rounded-md border border-gray-200 p-0.5 bg-gray-50 w-fit">
                      <button
                        type="button"
                        onClick={() => { setTopicMode("bank"); setSingleTopic(""); setSelectedTopicId(""); }}
                        className={`rounded px-3 py-1 text-xs font-medium transition-colors ${topicMode === "bank" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        From topic bank
                      </button>
                      <button
                        type="button"
                        onClick={() => { setTopicMode("custom"); setSelectedTopicId(""); }}
                        className={`rounded px-3 py-1 text-xs font-medium transition-colors ${topicMode === "custom" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        Custom topic
                      </button>
                    </div>
                  )}

                  {/* Topic bank selector */}
                  {topicMode === "bank" && topics.length > 0 ? (
                    <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto pr-1">
                      {topics.map((topic) => (
                        <button
                          key={topic.id}
                          type="button"
                          onClick={() => handleSelectTopic(topic.id)}
                          className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                            selectedTopicId === topic.id
                              ? "border-sky-400 bg-sky-50 ring-1 ring-sky-200"
                              : topic.is_used
                              ? "border-gray-100 bg-gray-50 opacity-60 hover:opacity-80 hover:border-gray-200"
                              : "border-gray-200 hover:border-sky-300 hover:bg-sky-50/30"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-[10px] text-gray-400 font-mono">#{topic.topic_number}</span>
                              <p className="text-sm font-medium text-gray-900 leading-snug mt-0.5">{topic.title}</p>
                              {topic.description && (
                                <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{topic.description}</p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              {topic.pillar && (
                                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{topic.pillar}</span>
                              )}
                              {topic.is_used && (
                                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">Used</span>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    /* Custom topic text input */
                    <input
                      type="text"
                      value={singleTopic}
                      onChange={(e) => setSingleTopic(e.target.value)}
                      placeholder={selectedScope === "single_blog"
                        ? "e.g. Why clinical champions are the hidden buyers in MedTech"
                        : "e.g. The 12-minute supplier meeting problem"
                      }
                      className="mt-1.5 block w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                    />
                  )}
                </div>
                {selectedScope === "single_post" && postTypes.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-900">Post type (optional)</label>
                    <select
                      value={singlePostType}
                      onChange={(e) => setSinglePostType(e.target.value)}
                      className="mt-1.5 block w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                    >
                      <option value="">Auto-select best format</option>
                      {postTypes.map((pt) => (
                        <option key={pt.slug} value={pt.slug}>{pt.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Schedule this post */}
              <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-900">Schedule (optional)</label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Pick a date and time for this post. Leave as-is for an unscheduled draft.
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Date</label>
                    <input
                      type="date"
                      value={singleDate}
                      onChange={(e) => setSingleDate(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                  <div className="w-36">
                    <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Time</label>
                    <input
                      type="time"
                      value={singleTime}
                      onChange={(e) => setSingleTime(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                </div>
                {singleDate && (
                  <p className="text-xs text-sky-600">
                    Scheduled for{" "}
                    {new Date(singleDate + "T" + singleTime).toLocaleDateString("en-GB", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}{" "}
                    at {singleTime}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Full week configuration ─── */}
          {isWeekMode && (
            <div className="space-y-3">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <label className="text-sm font-medium text-gray-900">Select week</label>
                <p className="mt-0.5 text-xs text-gray-500">Weeks start on Sunday. Calendar entries are highlighted automatically.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {getUpcomingWeekStarts(10).map((sundayStr) => {
                    const sunday = new Date(sundayStr + "T00:00:00");
                    const saturday = new Date(sunday);
                    saturday.setDate(saturday.getDate() + 6);
                    const calWeek = weeks.find((w) => w.date_start === sundayStr);
                    const isSelected = selectedWeekStart === sundayStr;
                    return (
                      <button
                        key={sundayStr}
                        onClick={() => handleSelectWeekDate(sundayStr)}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          isSelected
                            ? "border-sky-400 bg-sky-50 ring-1 ring-sky-200"
                            : calWeek
                            ? "border-gray-200 bg-white hover:border-sky-300 hover:bg-sky-50/30"
                            : "border-gray-100 bg-gray-50/50 hover:border-gray-200 hover:bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {formatShortDate(sunday)} – {formatShortDate(saturday)}
                            </p>
                            {calWeek ? (
                              <p className="mt-0.5 text-xs text-gray-500">Week {calWeek.week_number}</p>
                            ) : (
                              <p className="mt-0.5 text-xs text-gray-400">No calendar entry</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {calWeek?.pillar && (
                              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{calWeek.pillar}</span>
                            )}
                            {calWeek?.theme && (
                              <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-600">{calWeek.theme}</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cohesive subject for selected week */}
              {selectedWeekStart && isCohesive && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">Week Subject</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Every post this week explores this subject from a different angle.
                  </p>
                  <input
                    type="text"
                    value={weekSubject}
                    onChange={(e) => setWeekSubject(e.target.value)}
                    placeholder="e.g. Patient referral pathways in MedTech procurement"
                    className="mt-2 block w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Full month configuration ─── */}
          {isMonthMode && (
            <div className="space-y-3">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <label className="text-sm font-medium text-gray-900">Select starting week</label>
                <p className="mt-0.5 text-xs text-gray-500">Generate 4 consecutive weeks of interlinked content.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {getUpcomingWeekStarts(8).map((sundayStr) => {
                    const sunday = new Date(sundayStr + "T00:00:00");
                    const endDate = new Date(sunday);
                    endDate.setDate(endDate.getDate() + 27);
                    const isSelected = selectedWeekStart === sundayStr;
                    return (
                      <button
                        key={sundayStr}
                        onClick={() => handleSelectWeekDate(sundayStr)}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          isSelected
                            ? "border-sky-400 bg-sky-50 ring-1 ring-sky-200"
                            : "border-gray-200 bg-white hover:border-sky-300"
                        }`}
                      >
                        <p className="text-sm font-semibold text-gray-900">
                          {formatShortDate(sunday)} – {formatShortDate(endDate)}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">4 weeks</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedWeekStart && isCohesive && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">Monthly Theme</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Each week will explore different angles of this theme.
                  </p>
                  <input
                    type="text"
                    value={weekSubject}
                    onChange={(e) => setWeekSubject(e.target.value)}
                    placeholder="e.g. Patient marketing as a growth lever"
                    className="mt-2 block w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* Options + generate button */}
          {(isSingleMode || isWeekMode || (isMonthMode && selectedWeekStart)) && (
            <>
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={generateImages}
                    onChange={(e) => setGenerateImages(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900">Generate images automatically</span>
                    <p className="text-xs text-gray-500">Create the image from the image prompt after content is generated.</p>
                  </div>
                </label>
              </div>

              {/* Translation options — week/month only */}
              {(isWeekMode || isMonthMode) && (
                <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
                  <div>
                    <span className="text-sm font-semibold text-gray-900">Translate into additional languages</span>
                    <p className="text-xs text-gray-500 mt-0.5">After generation, translate all content into selected languages.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { code: "fr", label: "French", flag: "FR" },
                      { code: "de", label: "German", flag: "DE" },
                      { code: "es", label: "Spanish", flag: "ES" },
                      { code: "it", label: "Italian", flag: "IT" },
                      { code: "nl", label: "Dutch", flag: "NL" },
                      { code: "pt", label: "Portuguese", flag: "PT" },
                      { code: "pl", label: "Polish", flag: "PL" },
                      { code: "sv", label: "Swedish", flag: "SE" },
                      { code: "da", label: "Danish", flag: "DK" },
                    ].map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => {
                          setSelectedLanguages((prev) =>
                            prev.includes(lang.code)
                              ? prev.filter((l) => l !== lang.code)
                              : [...prev, lang.code]
                          );
                        }}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                          selectedLanguages.includes(lang.code)
                            ? "border-sky-400 bg-sky-50 text-sky-700"
                            : "border-gray-200 text-gray-500 hover:border-gray-300"
                        }`}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                  {selectedLanguages.length > 0 && (
                    <p className="text-xs text-sky-600">
                      Will translate {selectedLanguages.length} language{selectedLanguages.length > 1 ? "s" : ""} after generation
                    </p>
                  )}
                </div>
              )}

              {/* Regulatory review — week/month only */}
              {(isWeekMode || isMonthMode) && (
                <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={runRegReview}
                      onChange={(e) => setRunRegReview(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900">Run legal and regulatory review</span>
                      <p className="text-xs text-gray-500">Check content for healthcare advertising compliance issues across target markets.</p>
                    </div>
                  </label>
                  {runRegReview && (
                    <div>
                      <p className="text-xs font-medium text-gray-700 mb-1.5">Target markets:</p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { code: "GB", label: "UK" },
                          { code: "FR", label: "France" },
                          { code: "DE", label: "Germany" },
                          { code: "BE", label: "Belgium" },
                          { code: "NL", label: "Netherlands" },
                          { code: "IT", label: "Italy" },
                          { code: "ES", label: "Spain" },
                        ].map((country) => (
                          <button
                            key={country.code}
                            type="button"
                            onClick={() => {
                              setSelectedCountries((prev) =>
                                prev.includes(country.code)
                                  ? prev.filter((c) => c !== country.code)
                                  : [...prev, country.code]
                              );
                            }}
                            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                              selectedCountries.includes(country.code)
                                ? "border-amber-400 bg-amber-50 text-amber-700"
                                : "border-gray-200 text-gray-500 hover:border-gray-300"
                            }`}
                          >
                            {country.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={
                  (isSingleMode && topicMode === "bank" && !selectedTopicId) ||
                  (isSingleMode && topicMode === "custom" && !singleTopic.trim()) ||
                  (isWeekMode && !selectedWeekStart) ||
                  (isWeekMode && isCohesive && !weekSubject.trim())
                }
                className="w-full rounded-lg bg-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-700 disabled:opacity-50"
              >
                {isSingleMode
                  ? "Generate"
                  : isMonthMode
                  ? `Generate 4 Weeks${selectedLanguages.length > 0 ? ` + ${selectedLanguages.length} Languages` : ""}${runRegReview ? " + Reg Review" : ""}`
                  : `Generate Week${selectedLanguages.length > 0 ? ` + ${selectedLanguages.length} Languages` : ""}${runRegReview ? " + Reg Review" : ""}`}
              </button>
            </>
          )}
        </div>
      )}

      {/* Step 4: Generating */}
      {step === "generating" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center space-y-4">
          {(status.phase === "preparing" || status.phase === "generating" || status.phase === "images" || status.phase === "translating" || status.phase === "reviewing") && (
            <>
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" />
              <p className="text-sm text-gray-600">{status.currentLabel}</p>
              {status.total > 1 && (
                <>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-sky-500 transition-all"
                      style={{ width: `${status.total ? (status.current / status.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400">{status.current}/{status.total} pieces</p>
                </>
              )}
            </>
          )}

          {status.phase === "complete" && (
            <>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-green-700">{status.currentLabel}</p>

              {/* Translation results summary */}
              {translationResults && translationResults.translatedCount > 0 && (
                <div className="mx-auto max-w-md rounded-lg border border-sky-200 bg-sky-50 p-3 text-left">
                  <p className="text-xs font-semibold text-sky-800">
                    Translated {translationResults.translatedCount} piece{translationResults.translatedCount > 1 ? "s" : ""} into {translationResults.targetLanguages.length} language{translationResults.targetLanguages.length > 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-sky-600 mt-1">
                    Languages: {translationResults.targetLanguages.join(", ").toUpperCase()}
                  </p>
                </div>
              )}

              {/* Regulatory review results */}
              {regReviewResults && (
                <div className="mx-auto max-w-lg space-y-3 text-left">
                  <div className={`rounded-lg border p-3 ${
                    regReviewResults.criticalCount > 0 ? "border-red-300 bg-red-50" :
                    regReviewResults.warningCount > 0 ? "border-amber-300 bg-amber-50" :
                    "border-green-300 bg-green-50"
                  }`}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-800">Regulatory Review</p>
                      <div className="flex gap-2">
                        {regReviewResults.criticalCount > 0 && (
                          <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                            {regReviewResults.criticalCount} critical
                          </span>
                        )}
                        {regReviewResults.warningCount > 0 && (
                          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                            {regReviewResults.warningCount} warning{regReviewResults.warningCount > 1 ? "s" : ""}
                          </span>
                        )}
                        {regReviewResults.totalIssues === 0 && (
                          <span className="rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-bold text-white">
                            All clear
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {regReviewResults.results.filter((r) => r.issues.length > 0).map((result) => (
                    <div key={result.pieceId} className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-gray-900">{result.title}</p>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          result.overallRisk === "critical" ? "bg-red-100 text-red-700" :
                          result.overallRisk === "high" ? "bg-orange-100 text-orange-700" :
                          result.overallRisk === "medium" ? "bg-amber-100 text-amber-700" :
                          "bg-green-100 text-green-700"
                        }`}>
                          {result.overallRisk} risk
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{result.summary}</p>
                      {result.issues.map((issue, idx) => (
                        <div key={idx} className={`rounded border-l-2 p-2 text-xs ${
                          issue.flag === "critical" ? "border-red-500 bg-red-50" :
                          issue.flag === "warning" ? "border-amber-500 bg-amber-50" :
                          "border-blue-500 bg-blue-50"
                        }`}>
                          <div className="flex items-center gap-2">
                            <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${
                              issue.flag === "critical" ? "bg-red-600 text-white" :
                              issue.flag === "warning" ? "bg-amber-500 text-white" :
                              "bg-blue-500 text-white"
                            }`}>{issue.flag}</span>
                            <span className="font-semibold text-gray-800">{issue.title}</span>
                            <span className="text-gray-400">{issue.countries.join(", ")}</span>
                          </div>
                          <p className="mt-1 text-gray-600">{issue.description}</p>
                          <p className="mt-1 text-gray-800 font-medium">Fix: {issue.suggestion}</p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-center gap-3">
                {selectedWeekId && (
                  <a href={`/review/${selectedWeekId}`} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
                    Review Content
                  </a>
                )}
                {selectedWeekId && selectedCompanyId && (isWeekMode || isMonthMode) && (
                  <a
                    href={`/api/generate/report?weekId=${selectedWeekId}&companyId=${selectedCompanyId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100"
                  >
                    Download Report
                  </a>
                )}
                <button
                  onClick={() => {
                    setStep("scope");
                    setSelectedScope("");
                    setSelectedLanguages([]);
                    setSelectedCountries(["GB"]);
                    setRunRegReview(false);
                    setRegReviewResults(null);
                    setTranslationResults(null);
                    setStatus({ phase: "idle", current: 0, total: 0, currentLabel: "" });
                  }}
                  className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Generate More
                </button>
              </div>
            </>
          )}

          {status.phase === "error" && (
            <>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-sm text-red-600">{status.error}</p>
              <button
                onClick={() => {
                  setStep("configure");
                  setStatus({ phase: "idle", current: 0, total: 0, currentLabel: "" });
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Try again
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
