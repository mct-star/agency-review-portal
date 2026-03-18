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

interface GenerationStatus {
  phase: "idle" | "preparing" | "generating" | "images" | "complete" | "error";
  current: number;
  total: number;
  currentLabel: string;
  error?: string;
}

type Step = "company" | "week" | "configure" | "generating";

export default function GeneratePage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedWeekId, setSelectedWeekId] = useState("");
  const [step, setStep] = useState<Step>("company");
  const [generateImages, setGenerateImages] = useState(true);
  const [weekSubject, setWeekSubject] = useState("");
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
        // Auto-select if only one company
        if (list.length === 1) {
          setSelectedCompanyId(list[0].id);
          setStep("week");
        }
      });
  }, []);

  // Fetch weeks when company selected
  useEffect(() => {
    if (!selectedCompanyId) return;
    fetch(`/api/weeks?companyId=${selectedCompanyId}`)
      .then((r) => r.json())
      .then((d) => setWeeks(d.data || []));
  }, [selectedCompanyId]);

  const handleSelectCompany = (id: string) => {
    setSelectedCompanyId(id);
    setSelectedWeekId("");
    setStep("week");
  };

  const handleSelectWeek = (id: string) => {
    setSelectedWeekId(id);
    const week = weeks.find((w) => w.id === id);
    // Auto-populate subject: use existing subject, or derive from theme
    if (week?.subject) {
      setWeekSubject(week.subject);
    } else if (week?.theme) {
      // Use the week's theme as the starting subject (user can override)
      setWeekSubject(week.theme);
    }
    setStep("configure");
  };

  const handleGenerate = useCallback(async () => {
    setStep("generating");
    setStatus({ phase: "preparing", current: 0, total: 0, currentLabel: "Getting slot assignments..." });

    try {
      // Step 1: Get the plan (slot assignments) — fast, no AI calls
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

      // Step 2: Generate each piece individually (each under 60s)
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

            // Step 3: Generate image if enabled (each under 60s)
            if (generateImages && contentData.imagePrompt) {
              setStatus({
                phase: "images",
                current: i,
                total,
                currentLabel: `Generating image for ${assignment.slotLabel} (${i + 1}/${total})...`,
              });

              try {
                const imgRes = await fetch("/api/generate/images", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    companyId: selectedCompanyId,
                    contentPieceId: contentData.pieceId,
                    prompts: [contentData.imagePrompt],
                  }),
                });
                if (imgRes.ok) imagesCreated++;
              } catch {
                // Image generation failed — continue without it
              }
            }
          }
        } catch {
          // Individual piece failed — continue with next
        }
      }

      if (piecesCreated === 0) {
        setStatus({
          phase: "error",
          current: 0,
          total,
          currentLabel: "",
          error: `Generation failed for all ${total} pieces. Check that your Anthropic API key is valid in Setup > API Keys.`,
        });
      } else {
        setStatus({
          phase: "complete",
          current: piecesCreated,
          total,
          currentLabel: `Generated ${piecesCreated}/${total} pieces${imagesCreated ? ` + ${imagesCreated} images` : ""}`,
        });
      }
    } catch (err) {
      setStatus({
        phase: "error",
        current: 0,
        total: 0,
        currentLabel: "",
        error: err instanceof Error ? err.message : "Generation failed",
      });
    }
  }, [selectedCompanyId, selectedWeekId, isCohesive, weekSubject, generateImages]);

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
        {(["company", "week", "configure", "generating"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-6 bg-gray-200" />}
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                step === s
                  ? "bg-sky-600 text-white"
                  : ["company", "week", "configure", "generating"].indexOf(step) > i
                  ? "bg-green-500 text-white"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {["company", "week", "configure", "generating"].indexOf(step) > i ? (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className={`text-xs ${step === s ? "font-semibold text-gray-900" : "text-gray-500"}`}>
              {s === "company" ? "Company" : s === "week" ? "Week" : s === "configure" ? "Configure" : "Generate"}
            </span>
          </div>
        ))}
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
              <span className="mt-2 inline-block rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                {c.content_strategy_mode === "cohesive" ? "Cohesive weeks" : "Variety mode"}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: Week */}
      {step === "week" && (
        <div className="space-y-3">
          <button
            onClick={() => setStep("company")}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            ← Back to companies
          </button>
          <div className="space-y-2">
            {weeks
              .filter((w) => w.status === "draft")
              .map((w) => (
                <button
                  key={w.id}
                  onClick={() => handleSelectWeek(w.id)}
                  className="block w-full rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-sky-300"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        Week {w.week_number}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {w.date_start} — {w.date_end}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {w.pillar && (
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          {w.pillar}
                        </span>
                      )}
                      {w.theme && (
                        <span className="rounded bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600">
                          {w.theme}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            {weeks.filter((w) => w.status === "draft").length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
                <p className="text-gray-500">No draft weeks available. Create a week first.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Configure */}
      {step === "configure" && selectedWeek && (
        <div className="space-y-4">
          <button
            onClick={() => setStep("week")}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            ← Back to weeks
          </button>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">
                  Week {selectedWeek.week_number}
                </h3>
                <p className="text-sm text-gray-500">
                  {selectedWeek.date_start} — {selectedWeek.date_end}
                </p>
              </div>
              {selectedWeek.theme && (
                <span className="rounded bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600">
                  Theme: {selectedWeek.theme}
                </span>
              )}
            </div>
          </div>

          {/* Cohesive mode: enter subject */}
          {isCohesive && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Week Subject</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Every post this week explores this subject from a different angle.
                    {selectedWeek.theme && (
                      <span className="ml-1 text-sky-600">
                        Auto-filled from your content strategy theme.
                      </span>
                    )}
                  </p>
                </div>
                {/* Tooltip */}
                <div className="group relative">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-700 cursor-help">?</div>
                  <div className="absolute right-0 top-7 z-10 hidden w-72 rounded-lg bg-gray-900 p-3 text-xs text-gray-100 shadow-lg group-hover:block">
                    <p className="font-semibold text-white">How does this work?</p>
                    <p className="mt-1">In cohesive mode, the Monday Problem Post, Tuesday Launch Story, Friday Founder post, etc. all explore the SAME subject from their unique structural angle. This creates a connected week where readers get a complete picture.</p>
                    <p className="mt-2">The subject is pre-filled from your content strategy theme. Refine it to be more specific if needed.</p>
                    <div className="absolute -top-1 right-3 h-2 w-2 rotate-45 bg-gray-900" />
                  </div>
                </div>
              </div>
              <input
                type="text"
                value={weekSubject}
                onChange={(e) => setWeekSubject(e.target.value)}
                placeholder="e.g. Patient referral pathways in MedTech procurement"
                className="mt-2 block w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
              />
              {selectedWeek.theme && weekSubject === selectedWeek.theme && (
                <p className="mt-1.5 text-[10px] text-sky-500">
                  Tip: Make this more specific. Instead of &quot;{selectedWeek.theme}&quot;, try something like
                  &quot;{selectedWeek.theme} in procurement decision-making&quot;
                </p>
              )}
            </div>
          )}

          {/* Options */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={generateImages}
                onChange={(e) => setGenerateImages(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">Generate images automatically</span>
                <p className="text-xs text-gray-500">
                  After each post is generated, create the image from the image prompt.
                </p>
              </div>
            </label>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={isCohesive && !weekSubject.trim()}
            className="w-full rounded-lg bg-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-700 disabled:opacity-50"
          >
            Generate Week {selectedWeek.week_number}
          </button>
        </div>
      )}

      {/* Step 4: Generating */}
      {step === "generating" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center space-y-4">
          {status.phase === "preparing" && (
            <>
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" />
              <p className="text-sm text-gray-600">{status.currentLabel}</p>
            </>
          )}

          {status.phase === "generating" && (
            <>
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" />
              <p className="text-sm text-gray-600">{status.currentLabel}</p>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all"
                  style={{ width: `${status.total ? (status.current / status.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">
                {status.current}/{status.total} pieces
              </p>
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
                <a
                  href={`/review/${selectedWeekId}`}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                >
                  Review Week
                </a>
                <button
                  onClick={() => {
                    setStep("week");
                    setStatus({ phase: "idle", current: 0, total: 0, currentLabel: "" });
                  }}
                  className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Generate Another
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
