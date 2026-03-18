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

interface GenerationStatus {
  phase: "idle" | "preparing" | "generating" | "images" | "complete" | "error";
  current: number;
  total: number;
  currentLabel: string;
  error?: string;
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

  // Fetch weeks + post types when company selected
  useEffect(() => {
    if (!selectedCompanyId) return;
    fetch(`/api/weeks?companyId=${selectedCompanyId}`)
      .then((r) => r.json())
      .then((d) => setWeeks(d.data || []));
    // Fetch post types for single post generation
    fetch(`/api/post-types?companyId=${selectedCompanyId}`)
      .then((r) => r.json())
      .then((d) => setPostTypes(d.data || []))
      .catch(() => setPostTypes([]));
  }, [selectedCompanyId]);

  const handleSelectCompany = (id: string) => {
    setSelectedCompanyId(id);
    setSelectedWeekId("");
    setSelectedScope("");
    setStep("scope");
  };

  const handleSelectScope = (scope: GenerationScope) => {
    setSelectedScope(scope);
    setStep("configure");
  };

  const handleSelectWeek = (id: string) => {
    setSelectedWeekId(id);
    const week = weeks.find((w) => w.id === id);
    if (week?.subject) {
      setWeekSubject(week.subject);
    } else if (week?.theme) {
      setWeekSubject(week.theme);
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
      // For single pieces, create a lightweight week container if none selected
      let weekId = selectedWeekId;
      if (!weekId) {
        // Create an ad-hoc week for standalone content
        const weekRes = await fetch("/api/weeks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: selectedCompanyId,
            weekNumber: 0,
            year: new Date().getFullYear(),
            title: `Standalone ${contentType.replace(/_/g, " ")}`,
            status: "draft",
          }),
        });
        const weekData = await weekRes.json();
        weekId = weekData.data?.id || weekData.id;
        if (!weekId) throw new Error("Failed to create content container");
      }

      const contentRes = await fetch("/api/generate/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          weekId,
          contentType,
          postTypeSlug: singlePostType || undefined,
          additionalContext: singleTopic ? `TOPIC: ${singleTopic}` : undefined,
        }),
      });

      const contentData = await contentRes.json();
      if (!contentRes.ok) throw new Error(contentData.error || "Generation failed");

      // Generate image if applicable
      if (generateImages && contentData.imagePrompt && contentType === "social_post") {
        setStatus({ phase: "images", current: 0, total: 1, currentLabel: "Generating image..." });
        try {
          await fetch("/api/generate/images", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId: selectedCompanyId,
              contentPieceId: contentData.pieceId,
              prompts: [typeof contentData.imagePrompt === "string"
                ? contentData.imagePrompt
                : contentData.imagePrompt],
            }),
          });
        } catch { /* image failed, continue */ }
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
  }, [selectedCompanyId, selectedWeekId, selectedScope, singleTopic, singlePostType, generateImages]);

  // ─── Full week generation ──────────────────────────────
  const handleGenerateWeek = useCallback(async () => {
    if (!selectedWeekId) return;
    setStep("generating");
    setStatus({ phase: "preparing", current: 0, total: 0, currentLabel: "Getting slot assignments..." });

    try {
      const planRes = await fetch("/api/generate/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          weekId: selectedWeekId,
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

      for (let i = 0; i < assignments.length; i++) {
        const assignment = assignments[i];
        setStatus({
          phase: "generating",
          current: i,
          total,
          currentLabel: `Generating ${assignment.slotLabel || assignment.postTypeLabel} (${i + 1}/${total})...`,
        });

        try {
          const contentRes = await fetch("/api/generate/content", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId: selectedCompanyId,
              weekId: selectedWeekId,
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
              additionalContext: assignment.angle
                ? `WEEK SUBJECT: ${weekSubject}\nANGLE FOR THIS POST: ${assignment.angle}`
                : undefined,
            }),
          });

          const contentData = await contentRes.json();
          if (contentRes.ok) {
            piecesCreated++;

            if (generateImages && contentData.imagePrompt) {
              setStatus({
                phase: "images",
                current: i,
                total,
                currentLabel: `Generating image for ${assignment.slotLabel} (${i + 1}/${total})...`,
              });

              try {
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
        } catch { /* piece failed */ }
      }

      if (piecesCreated === 0) {
        setStatus({ phase: "error", current: 0, total, currentLabel: "", error: `Generation failed for all ${total} pieces. Check your Anthropic API key in Setup > API Keys.` });
      } else {
        setStatus({ phase: "complete", current: piecesCreated, total, currentLabel: `Generated ${piecesCreated}/${total} pieces${imagesCreated ? ` + ${imagesCreated} images` : ""}` });
      }
    } catch (err) {
      setStatus({ phase: "error", current: 0, total: 0, currentLabel: "", error: err instanceof Error ? err.message : "Generation failed" });
    }
  }, [selectedCompanyId, selectedWeekId, isCohesive, weekSubject, generateImages]);

  const handleGenerate = selectedScope === "full_week" || selectedScope === "full_month"
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

              {/* Optionally assign to a week */}
              {draftWeeks.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <label className="text-sm font-medium text-gray-900">Assign to a week (optional)</label>
                  <p className="text-xs text-gray-500 mt-0.5">Leave empty for a standalone piece.</p>
                  <select
                    value={selectedWeekId}
                    onChange={(e) => setSelectedWeekId(e.target.value)}
                    className="mt-1.5 block w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="">Standalone (no week)</option>
                    {draftWeeks.map((w) => (
                      <option key={w.id} value={w.id}>
                        Week {w.week_number} — {w.theme || w.date_start}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* ── Full week configuration ─── */}
          {isWeekMode && (
            <div className="space-y-3">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <label className="text-sm font-medium text-gray-900">Select week</label>
                <div className="mt-2 space-y-2">
                  {draftWeeks.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
                      <p className="text-sm text-gray-500">No draft weeks available.</p>
                      <p className="mt-1 text-xs text-gray-400">Create a new week in your content calendar first, then come back here.</p>
                      <a href="/admin/upload" className="mt-3 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
                        Create Week
                      </a>
                    </div>
                  ) : (
                    draftWeeks.map((w) => (
                      <button
                        key={w.id}
                        onClick={() => handleSelectWeek(w.id)}
                        className={`block w-full rounded-lg border p-3 text-left transition-colors ${
                          selectedWeekId === w.id
                            ? "border-sky-400 bg-sky-50 ring-1 ring-sky-200"
                            : "border-gray-200 hover:border-sky-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-semibold text-gray-900">Week {w.week_number}</span>
                            <span className="ml-2 text-sm text-gray-500">{w.date_start} — {w.date_end}</span>
                          </div>
                          <div className="flex gap-1">
                            {w.pillar && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{w.pillar}</span>}
                            {w.theme && <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-600">{w.theme}</span>}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Cohesive subject for selected week */}
              {selectedWeekId && isCohesive && (
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
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-sm font-semibold text-amber-800">Coming Soon</h3>
              <p className="mt-1 text-xs text-amber-700">
                Full month generation will auto-generate 4 consecutive weeks from your quarterly calendar.
                For now, generate each week individually using the Full Week option.
              </p>
              <button
                onClick={() => handleSelectScope("full_week")}
                className="mt-3 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                Generate a Full Week Instead
              </button>
            </div>
          )}

          {/* Options + generate button */}
          {!isMonthMode && (
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

              <button
                onClick={handleGenerate}
                disabled={
                  (isSingleMode && !singleTopic.trim()) ||
                  (isWeekMode && !selectedWeekId) ||
                  (isWeekMode && isCohesive && !weekSubject.trim())
                }
                className="w-full rounded-lg bg-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-700 disabled:opacity-50"
              >
                {isSingleMode ? "Generate" : `Generate Week ${selectedWeek?.week_number || ""}`}
              </button>
            </>
          )}
        </div>
      )}

      {/* Step 4: Generating */}
      {step === "generating" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center space-y-4">
          {(status.phase === "preparing" || status.phase === "generating" || status.phase === "images") && (
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
              <div className="flex justify-center gap-3">
                {selectedWeekId && (
                  <a href={`/review/${selectedWeekId}`} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
                    Review Content
                  </a>
                )}
                <button
                  onClick={() => {
                    setStep("scope");
                    setSelectedScope("");
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
