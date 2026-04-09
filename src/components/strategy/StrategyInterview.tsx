"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { POST_TYPES, WEEKLY_RHYTHMS } from "@/lib/constants/post-types";
import type { StrategySession, StrategyAudience, StrategyPositioning } from "@/types/database";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface StrategyInterviewProps {
  companyId: string;
  companyName: string;
  initialSession: StrategySession | null;
  existingAudiences: StrategyAudience[];
  existingPositioning: StrategyPositioning | null;
}

interface PersonaCard {
  id: string;
  name: string;
  jobTitle: string;
  seniority: string;
  primaryProblem: string;
  searchTerms: string;
}

type RhythmKey = keyof typeof WEEKLY_RHYTHMS;

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

const STEP_LABELS = [
  "Who Are You?",
  "Who Do You Help?",
  "What Makes You Different?",
  "What's Your Voice?",
  "Content Pillars",
  "Weekly Rhythm",
  "Narrative Arc",
  "Strategy Document",
];

const INDUSTRIES = [
  "Healthcare",
  "Financial Services",
  "Legal",
  "Technology",
  "Construction",
  "Energy",
  "Education",
  "Hospitality",
  "Manufacturing",
  "Professional Services",
  "Other",
];

const COMPANY_SIZES = ["Solo founder", "2-10", "11-50", "51-200", "200+"];
const OPERATING_YEARS = ["Less than 1 year", "1-3 years", "3-10 years", "10+ years"];

const SENIORITY_LEVELS = [
  "C-Suite",
  "VP / Director",
  "Senior Manager",
  "Manager",
  "Individual Contributor",
  "Founder / Owner",
];

const FORMALITY_LABELS = ["Very Casual", "Casual", "Balanced", "Formal", "Very Formal"];
const ENERGY_LABELS = ["Very Calm", "Calm", "Balanced", "Energetic", "Very Intense"];

const PHASE_CONFIG = [
  { label: "Establish Credibility", color: "emerald", bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
  { label: "Build Relationship", color: "blue", bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", dot: "bg-blue-500" },
  { label: "Challenge Thinking", color: "amber", bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" },
  { label: "Convert to Action", color: "purple", bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", dot: "bg-purple-500" },
];

const STRATEGY_SECTIONS = [
  "Executive Summary",
  "Company Overview & Market Context",
  "Target Audience Profiles",
  "Competitive Positioning & Differentiators",
  "Brand Voice Guidelines",
  "Content Pillars & Topic Architecture",
  "Weekly Publishing Rhythm",
  "12-Week Narrative Arc",
  "Measurement Framework",
  "Appendix: Post Type Specifications",
];

// ────────────────────────────────────────────────────────────
// Helper: unique ID
// ────────────────────────────────────────────────────────────

let _idCounter = 0;
function uid() {
  _idCounter += 1;
  return `p-${Date.now()}-${_idCounter}`;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export default function StrategyInterview({
  companyId,
  companyName,
  initialSession,
  existingAudiences,
  existingPositioning,
}: StrategyInterviewProps) {
  // ── State ──────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(initialSession?.current_step ?? 1);
  const [responses, setResponses] = useState<Record<string, unknown>>(
    initialSession?.responses ?? {}
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  // Step 1
  const [companyNameField, setCompanyNameField] = useState(
    (responses["1"] as Record<string, string>)?.companyName ?? companyName
  );
  const [whatDo, setWhatDo] = useState(
    (responses["1"] as Record<string, string>)?.whatDo ?? ""
  );
  const [industry, setIndustry] = useState(
    (responses["1"] as Record<string, string>)?.industry ?? ""
  );
  const [companySize, setCompanySize] = useState(
    (responses["1"] as Record<string, string>)?.companySize ?? ""
  );
  const [operatingYears, setOperatingYears] = useState(
    (responses["1"] as Record<string, string>)?.operatingYears ?? ""
  );

  // Step 2
  const [personas, setPersonas] = useState<PersonaCard[]>(() => {
    const saved = responses["2"] as PersonaCard[] | undefined;
    if (saved && saved.length > 0) return saved;
    if (existingAudiences.length > 0) {
      return existingAudiences.map((a) => ({
        id: a.id,
        name: a.persona_name,
        jobTitle: a.job_title ?? "",
        seniority: a.seniority ?? "",
        primaryProblem: a.primary_problem ?? "",
        searchTerms: a.search_terms?.join(", ") ?? "",
      }));
    }
    return [{ id: uid(), name: "", jobTitle: "", seniority: "", primaryProblem: "", searchTerms: "" }];
  });

  // Step 3
  const [competitorMistakes, setCompetitorMistakes] = useState(
    (responses["3"] as Record<string, string>)?.competitorMistakes ?? existingPositioning?.competitor_mistakes ?? ""
  );
  const [secretKnowledge, setSecretKnowledge] = useState(
    (responses["3"] as Record<string, string>)?.secretKnowledge ?? ""
  );
  const [customerDescription, setCustomerDescription] = useState(
    (responses["3"] as Record<string, string>)?.customerDescription ?? ""
  );
  const [transformBefore, setTransformBefore] = useState(
    (responses["3"] as Record<string, string>)?.transformBefore ?? existingPositioning?.transformation_before ?? ""
  );
  const [transformAfter, setTransformAfter] = useState(
    (responses["3"] as Record<string, string>)?.transformAfter ?? existingPositioning?.transformation_after ?? ""
  );

  // Step 4
  const [formality, setFormality] = useState(
    (responses["4"] as Record<string, number>)?.formality ?? 2
  );
  const [energy, setEnergy] = useState(
    (responses["4"] as Record<string, number>)?.energy ?? 2
  );
  const [toneWords, setToneWords] = useState(
    (responses["4"] as Record<string, string>)?.toneWords ?? ""
  );
  const [neverUse, setNeverUse] = useState(
    (responses["4"] as Record<string, string>)?.neverUse ?? ""
  );
  const [voiceSample, setVoiceSample] = useState(
    (responses["4"] as Record<string, string>)?.voiceSample ?? ""
  );

  // Step 5
  const [pillars, setPillars] = useState<Array<{ name: string; description: string; topics: string }>>(() => {
    const saved = responses["5"] as Array<{ name: string; description: string; topics: string }> | undefined;
    if (saved && saved.length > 0) return saved;
    return [
      { name: "", description: "", topics: "" },
      { name: "", description: "", topics: "" },
      { name: "", description: "", topics: "" },
    ];
  });
  const [suggestingPillars, setSuggestingPillars] = useState(false);

  // Step 6
  const [selectedRhythm, setSelectedRhythm] = useState<RhythmKey>(
    (responses["6"] as Record<string, RhythmKey>)?.selectedRhythm ?? "standard"
  );
  const [enabledPostTypes, setEnabledPostTypes] = useState<string[]>(() => {
    const saved = (responses["6"] as Record<string, string[]>)?.enabledPostTypes;
    if (saved) return saved;
    return [...WEEKLY_RHYTHMS.standard.suggested];
  });

  // Step 7
  const [weekThemes, setWeekThemes] = useState<string[]>(() => {
    const saved = responses["7"] as string[] | undefined;
    if (saved && saved.length === 12) return saved;
    return Array(12).fill("");
  });

  // Step 8
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const stepRef = useRef<HTMLDivElement>(null);

  // ── Collect current step data ──────────────────────────────
  const collectStepData = useCallback((): Record<string, unknown> => {
    switch (currentStep) {
      case 1:
        return { "1": { companyName: companyNameField, whatDo, industry, companySize, operatingYears } };
      case 2:
        return { "2": personas };
      case 3:
        return { "3": { competitorMistakes, secretKnowledge, customerDescription, transformBefore, transformAfter } };
      case 4:
        return { "4": { formality, energy, toneWords, neverUse, voiceSample } };
      case 5:
        return { "5": pillars };
      case 6:
        return { "6": { selectedRhythm, enabledPostTypes } };
      case 7:
        return { "7": weekThemes };
      case 8:
        return {};
      default:
        return {};
    }
  }, [currentStep, companyNameField, whatDo, industry, companySize, operatingYears, personas, competitorMistakes, secretKnowledge, customerDescription, transformBefore, transformAfter, formality, energy, toneWords, neverUse, voiceSample, pillars, selectedRhythm, enabledPostTypes, weekThemes]);

  // ── Auto-save ──────────────────────────────────────────────
  const saveProgress = useCallback(
    async (stepData: Record<string, unknown>, step: number) => {
      setSaving(true);
      setError(null);
      try {
        const merged = { ...responses, ...stepData };
        const res = await fetch("/api/strategy/interview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId,
            currentStep: step,
            responses: merged,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to save progress");
        }
        setResponses(merged);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      } finally {
        setSaving(false);
      }
    },
    [companyId, responses]
  );

  // ── Navigation ─────────────────────────────────────────────
  const goNext = useCallback(async () => {
    if (currentStep >= 8) return;
    const data = collectStepData();
    const nextStep = currentStep + 1;
    setDirection("forward");
    await saveProgress(data, nextStep);
    setCurrentStep(nextStep);
  }, [currentStep, collectStepData, saveProgress]);

  const goBack = useCallback(async () => {
    if (currentStep <= 1) return;
    const data = collectStepData();
    const prevStep = currentStep - 1;
    setDirection("back");
    await saveProgress(data, prevStep);
    setCurrentStep(prevStep);
  }, [currentStep, collectStepData, saveProgress]);

  // Scroll to top on step change
  useEffect(() => {
    stepRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentStep]);

  // ── Persona helpers ────────────────────────────────────────
  const updatePersona = (id: string, field: keyof PersonaCard, value: string) => {
    setPersonas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const addPersona = () => {
    if (personas.length >= 3) return;
    setPersonas((prev) => [
      ...prev,
      { id: uid(), name: "", jobTitle: "", seniority: "", primaryProblem: "", searchTerms: "" },
    ]);
  };

  const removePersona = (id: string) => {
    if (personas.length <= 1) return;
    setPersonas((prev) => prev.filter((p) => p.id !== id));
  };

  // ── Pillar helpers ─────────────────────────────────────────
  const updatePillar = (index: number, field: "name" | "description" | "topics", value: string) => {
    setPillars((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  const addPillar = () => {
    if (pillars.length >= 5) return;
    setPillars((prev) => [...prev, { name: "", description: "", topics: "" }]);
  };

  const removePillar = (index: number) => {
    if (pillars.length <= 3) return;
    setPillars((prev) => prev.filter((_, i) => i !== index));
  };

  // ── AI suggestions ────────────────────────────────────────
  const suggestPillars = async () => {
    setSuggestingPillars(true);
    setError(null);
    try {
      const res = await fetch("/api/strategy/suggest-pillars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          responses: { ...responses, ...collectStepData() },
        }),
      });
      if (!res.ok) throw new Error("Failed to get suggestions");
      const data = await res.json();
      if (data.pillars && Array.isArray(data.pillars)) {
        const newPillars = data.pillars.slice(0, 5).map((p: { name?: string; description?: string; topics?: string[] }) => ({
          name: p.name ?? "",
          description: p.description ?? "",
          topics: Array.isArray(p.topics) ? p.topics.join(", ") : "",
        }));
        setPillars(newPillars.length >= 3 ? newPillars : [...newPillars, ...Array(3 - newPillars.length).fill({ name: "", description: "", topics: "" })]);
      }
    } catch {
      setError("Could not generate pillar suggestions. Try again or fill in manually.");
    } finally {
      setSuggestingPillars(false);
    }
  };

  // ── Rhythm selection ───────────────────────────────────────
  const selectRhythm = (key: RhythmKey) => {
    setSelectedRhythm(key);
    setEnabledPostTypes([...WEEKLY_RHYTHMS[key].suggested]);
  };

  const togglePostType = (slug: string) => {
    setEnabledPostTypes((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  // ── Generate strategy document ─────────────────────────────
  const generateDocument = async () => {
    setGenerating(true);
    setError(null);
    try {
      const allData = { ...responses, ...collectStepData() };
      await saveProgress(collectStepData(), 8);
      const res = await fetch("/api/strategy/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, responses: allData }),
      });
      if (!res.ok) throw new Error("Failed to generate strategy document");
      const data = await res.json();
      setGenerated(true);
      setPdfUrl(data.pdfUrl ?? null);
      setShareLink(data.shareLink ?? null);
    } catch {
      setError("Failed to generate strategy document. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  // ────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────

  return (
    <div ref={stepRef} className="mx-auto max-w-3xl pb-32">
      {/* ═══ Progress Bar ═══ */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-100 py-4 px-2 -mx-2">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {STEP_LABELS.map((label, i) => {
            const stepNum = i + 1;
            const done = stepNum < currentStep;
            const active = stepNum === currentStep;
            return (
              <div key={i} className="flex flex-col items-center relative flex-1">
                {/* Connecting line */}
                {i > 0 && (
                  <div
                    className={`absolute top-4 right-1/2 w-full h-0.5 -translate-y-1/2 ${
                      stepNum <= currentStep ? "bg-violet-400" : "bg-gray-200"
                    }`}
                    style={{ zIndex: -1 }}
                  />
                )}
                <div
                  className={`relative flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                    done
                      ? "bg-violet-600 text-white"
                      : active
                        ? "bg-white text-violet-700 ring-2 ring-violet-600 shadow-md"
                        : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {done ? (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    stepNum
                  )}
                </div>
                <span
                  className={`mt-1.5 text-[10px] leading-tight text-center hidden sm:block ${
                    active ? "text-violet-700 font-semibold" : "text-gray-400"
                  }`}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ Error banner ═══ */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4m0 4h.01" />
          </svg>
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ═══ Step Content ═══ */}
      <div
        className={`mt-8 transition-all duration-300 ${
          direction === "forward" ? "animate-fade-in-right" : "animate-fade-in-left"
        }`}
        key={currentStep}
      >
        {/* ─── Step 1: Who Are You? ─── */}
        {currentStep === 1 && (
          <StepCard number={1} title="Who Are You?" subtitle="Tell us about your company so we can tailor your strategy.">
            <div className="space-y-5">
              <Field label="Company name">
                <input
                  type="text"
                  value={companyNameField}
                  onChange={(e) => setCompanyNameField(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  placeholder="Your company name"
                />
              </Field>
              <Field label="What does your company do?" hint="2-3 sentences describing your core offering">
                <textarea
                  value={whatDo}
                  onChange={(e) => setWhatDo(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 min-h-[100px] resize-y"
                  placeholder="We help healthcare companies..."
                />
              </Field>
              <Field label="Industry">
                <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500">
                  <option value="">Select your industry</option>
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Company size">
                  <select value={companySize} onChange={(e) => setCompanySize(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500">
                    <option value="">Select size</option>
                    {COMPANY_SIZES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="How long operating?">
                  <select value={operatingYears} onChange={(e) => setOperatingYears(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500">
                    <option value="">Select range</option>
                    {OPERATING_YEARS.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </StepCard>
        )}

        {/* ─── Step 2: Who Do You Help? ─── */}
        {currentStep === 2 && (
          <StepCard number={2} title="Who Do You Help?" subtitle="Define up to 3 audience personas you create content for.">
            <div className="space-y-4">
              {personas.map((persona, idx) => (
                <div key={persona.id} className="rounded-xl border border-gray-200 bg-gray-50/50 p-5 relative">
                  {personas.length > 1 && (
                    <button
                      onClick={() => removePersona(persona.id)}
                      className="absolute top-3 right-3 p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      aria-label="Remove persona"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Persona {idx + 1}
                  </p>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Name / Label" compact>
                        <input
                          type="text"
                          value={persona.name}
                          onChange={(e) => updatePersona(persona.id, "name", e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                          placeholder="e.g. Procurement Director"
                        />
                      </Field>
                      <Field label="Job title" compact>
                        <input
                          type="text"
                          value={persona.jobTitle}
                          onChange={(e) => updatePersona(persona.id, "jobTitle", e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                          placeholder="e.g. Head of Procurement"
                        />
                      </Field>
                    </div>
                    <Field label="Seniority level" compact>
                      <select
                        value={persona.seniority}
                        onChange={(e) => updatePersona(persona.id, "seniority", e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      >
                        <option value="">Select level</option>
                        {SENIORITY_LEVELS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Their #1 problem" compact>
                      <textarea
                        value={persona.primaryProblem}
                        onChange={(e) => updatePersona(persona.id, "primaryProblem", e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 min-h-[72px] resize-y"
                        placeholder="What keeps them up at night?"
                      />
                    </Field>
                    <Field label="What they search for online" compact>
                      <textarea
                        value={persona.searchTerms}
                        onChange={(e) => updatePersona(persona.id, "searchTerms", e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 min-h-[72px] resize-y"
                        placeholder="Keywords, questions, topics they Google"
                      />
                    </Field>
                  </div>
                </div>
              ))}
              {personas.length < 3 && (
                <button
                  onClick={addPersona}
                  className="w-full rounded-xl border-2 border-dashed border-gray-200 py-3 text-sm font-medium text-gray-500 hover:border-violet-300 hover:text-violet-600 transition-colors"
                >
                  + Add another persona
                </button>
              )}
            </div>
          </StepCard>
        )}

        {/* ─── Step 3: What Makes You Different? ─── */}
        {currentStep === 3 && (
          <StepCard number={3} title="What Makes You Different?" subtitle="Your positioning is the foundation of every piece of content.">
            <div className="space-y-5">
              <Field label="What do most companies in your space get wrong?">
                <textarea
                  value={competitorMistakes}
                  onChange={(e) => setCompetitorMistakes(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 min-h-[100px] resize-y"
                  placeholder="The biggest mistake companies in our industry make is..."
                />
              </Field>
              <Field label="What is the one thing you know that your competitors don't?">
                <textarea
                  value={secretKnowledge}
                  onChange={(e) => setSecretKnowledge(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 min-h-[100px] resize-y"
                  placeholder="The insight we have that others miss..."
                />
              </Field>
              <Field label="If a customer described you to a friend, what would they say?">
                <textarea
                  value={customerDescription}
                  onChange={(e) => setCustomerDescription(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 min-h-[100px] resize-y"
                  placeholder="They would say we are..."
                />
              </Field>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">
                  What transformation do you deliver?
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Before</span>
                    <textarea
                      value={transformBefore}
                      onChange={(e) => setTransformBefore(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 mt-1 min-h-[80px] resize-y"
                      placeholder="Where your customer starts..."
                    />
                  </div>
                  <div className="relative">
                    <div className="absolute left-0 top-1/2 -translate-x-1/2 flex items-center justify-center">
                      <svg className="h-5 w-5 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">After</span>
                    <textarea
                      value={transformAfter}
                      onChange={(e) => setTransformAfter(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 mt-1 min-h-[80px] resize-y"
                      placeholder="Where they end up..."
                    />
                  </div>
                </div>
              </div>
            </div>
          </StepCard>
        )}

        {/* ─── Step 4: What's Your Voice? ─── */}
        {currentStep === 4 && (
          <StepCard number={4} title="What's Your Voice?" subtitle="Define how you sound so every piece of content is unmistakably yours.">
            <div className="space-y-6">
              {/* Formality slider */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Formality</span>
                  <span className="text-xs text-violet-600 font-semibold">{FORMALITY_LABELS[formality]}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-14 text-right">Casual</span>
                  <input
                    type="range"
                    min={0}
                    max={4}
                    value={formality}
                    onChange={(e) => setFormality(Number(e.target.value))}
                    className="flex-1 accent-violet-600"
                  />
                  <span className="text-xs text-gray-400 w-14">Formal</span>
                </div>
              </div>

              {/* Energy slider */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Energy</span>
                  <span className="text-xs text-violet-600 font-semibold">{ENERGY_LABELS[energy]}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-14 text-right">Calm</span>
                  <input
                    type="range"
                    min={0}
                    max={4}
                    value={energy}
                    onChange={(e) => setEnergy(Number(e.target.value))}
                    className="flex-1 accent-violet-600"
                  />
                  <span className="text-xs text-gray-400 w-14">Intense</span>
                </div>
              </div>

              <Field label="5 words that describe your tone" hint="Comma-separated, e.g. bold, direct, warm, witty, grounded">
                <input
                  type="text"
                  value={toneWords}
                  onChange={(e) => setToneWords(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  placeholder="bold, direct, warm, witty, grounded"
                />
              </Field>

              <Field label="5 words or phrases to never use" hint="Things that feel off-brand or overused in your industry">
                <input
                  type="text"
                  value={neverUse}
                  onChange={(e) => setNeverUse(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  placeholder="synergy, disrupt, leverage, game-changer, circle back"
                />
              </Field>

              <Field label="Voice sample" hint="Write a sentence as you would explain your product to a new lead">
                <textarea
                  value={voiceSample}
                  onChange={(e) => setVoiceSample(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 min-h-[100px] resize-y"
                  placeholder="Write naturally, as if you're speaking to a potential customer for the first time..."
                />
              </Field>
            </div>
          </StepCard>
        )}

        {/* ─── Step 5: Content Pillars ─── */}
        {currentStep === 5 && (
          <StepCard number={5} title="What Are Your Content Pillars?" subtitle="Pillars are the 3-5 major themes your content revolves around.">
            <div className="space-y-4">
              {pillars.map((pillar, idx) => (
                <div key={idx} className="rounded-xl border border-gray-200 bg-gray-50/50 p-5 relative">
                  {pillars.length > 3 && (
                    <button
                      onClick={() => removePillar(idx)}
                      className="absolute top-3 right-3 p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      aria-label="Remove pillar"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Pillar {idx + 1}
                  </p>
                  <div className="space-y-3">
                    <Field label="Pillar name" compact>
                      <input
                        type="text"
                        value={pillar.name}
                        onChange={(e) => updatePillar(idx, "name", e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                        placeholder="e.g. Getting Products to Market"
                      />
                    </Field>
                    <Field label="Description" compact>
                      <textarea
                        value={pillar.description}
                        onChange={(e) => updatePillar(idx, "description", e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 min-h-[72px] resize-y"
                        placeholder="What does this pillar cover?"
                      />
                    </Field>
                    <Field label="Topic ideas" hint="Comma-separated" compact>
                      <input
                        type="text"
                        value={pillar.topics}
                        onChange={(e) => updatePillar(idx, "topics", e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                        placeholder="topic one, topic two, topic three"
                      />
                    </Field>
                  </div>
                </div>
              ))}

              <div className="flex gap-3">
                {pillars.length < 5 && (
                  <button
                    onClick={addPillar}
                    className="flex-1 rounded-xl border-2 border-dashed border-gray-200 py-3 text-sm font-medium text-gray-500 hover:border-violet-300 hover:text-violet-600 transition-colors"
                  >
                    + Add another pillar
                  </button>
                )}
                <button
                  onClick={suggestPillars}
                  disabled={suggestingPillars}
                  className="flex-1 rounded-xl border-2 border-violet-200 bg-violet-50 py-3 text-sm font-medium text-violet-700 hover:bg-violet-100 transition-colors disabled:opacity-50"
                >
                  {suggestingPillars ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner /> Suggesting...
                    </span>
                  ) : (
                    "Suggest pillars with AI"
                  )}
                </button>
              </div>
            </div>
          </StepCard>
        )}

        {/* ─── Step 6: Weekly Rhythm ─── */}
        {currentStep === 6 && (
          <StepCard number={6} title="What's Your Weekly Rhythm?" subtitle="Choose how often you want to publish and which post types to use.">
            <div className="space-y-6">
              {/* Rhythm selector cards */}
              <div className="grid grid-cols-2 gap-3">
                {(Object.entries(WEEKLY_RHYTHMS) as [RhythmKey, (typeof WEEKLY_RHYTHMS)[RhythmKey]][]).map(([key, rhythm]) => (
                  <button
                    key={key}
                    onClick={() => selectRhythm(key)}
                    className={`rounded-xl border-2 p-4 text-left transition-all ${
                      selectedRhythm === key
                        ? "border-violet-500 bg-violet-50 shadow-sm"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <p className="text-lg font-bold text-gray-900">{rhythm.postsPerWeek}/week</p>
                    <p className="text-xs text-gray-500 mt-0.5">{rhythm.label}</p>
                  </button>
                ))}
              </div>

              {/* Post types for selected rhythm */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">Post types in your rhythm</p>
                <div className="space-y-2">
                  {POST_TYPES.map((pt) => {
                    const enabled = enabledPostTypes.includes(pt.slug);
                    const suggested = WEEKLY_RHYTHMS[selectedRhythm].suggested.includes(pt.slug);
                    return (
                      <button
                        key={pt.slug}
                        onClick={() => togglePostType(pt.slug)}
                        className={`w-full flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                          enabled
                            ? "border-violet-200 bg-violet-50/50"
                            : "border-gray-100 bg-gray-50/50 opacity-60"
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-shrink-0 pt-0.5">
                          <div
                            className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${
                              enabled ? "border-violet-500 bg-violet-500" : "border-gray-300"
                            }`}
                          >
                            {enabled && (
                              <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: pt.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">{pt.label}</span>
                            {pt.weekdayHint && (
                              <span className="text-[10px] text-gray-400">{pt.weekdayHint}</span>
                            )}
                            {suggested && (
                              <span className="text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded font-medium">
                                Suggested
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{pt.ecosystemRole}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </StepCard>
        )}

        {/* ─── Step 7: Narrative Arc ─── */}
        {currentStep === 7 && (
          <StepCard number={7} title="Your Narrative Arc" subtitle="Plan a 12-week content arc across 4 phases. Each phase builds on the last.">
            <div className="space-y-6">
              {PHASE_CONFIG.map((phase, phaseIdx) => {
                const startWeek = phaseIdx * 3;
                return (
                  <div key={phaseIdx} className={`rounded-xl border ${phase.border} ${phase.bg} p-5`}>
                    <div className="flex items-center gap-2 mb-4">
                      <div className={`h-3 w-3 rounded-full ${phase.dot}`} />
                      <h3 className={`text-sm font-bold ${phase.text}`}>
                        Phase {phaseIdx + 1}: {phase.label}
                      </h3>
                      <span className="text-xs text-gray-400 ml-auto">
                        Weeks {startWeek + 1}-{startWeek + 3}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[0, 1, 2].map((offset) => {
                        const weekIdx = startWeek + offset;
                        return (
                          <div key={weekIdx}>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                              Week {weekIdx + 1}
                            </label>
                            <input
                              type="text"
                              value={weekThemes[weekIdx]}
                              onChange={(e) => {
                                const next = [...weekThemes];
                                next[weekIdx] = e.target.value;
                                setWeekThemes(next);
                              }}
                              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 mt-1 text-sm"
                              placeholder="Theme / focus"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </StepCard>
        )}

        {/* ─── Step 8: Strategy Document ─── */}
        {currentStep === 8 && (
          <StepCard number={8} title="Your Strategy Document" subtitle="Review and generate your professional content strategy.">
            <div className="space-y-6">
              {/* Section preview */}
              <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Document sections
                </p>
                <ol className="space-y-2">
                  {STRATEGY_SECTIONS.map((section, idx) => (
                    <li key={idx} className="flex items-center gap-3 text-sm text-gray-700">
                      <span className="flex h-6 w-6 items-center justify-center rounded bg-gray-200 text-[10px] font-bold text-gray-500">
                        {idx + 1}
                      </span>
                      {section}
                    </li>
                  ))}
                </ol>
              </div>

              {!generated ? (
                <button
                  onClick={generateDocument}
                  disabled={generating}
                  className="w-full rounded-xl bg-violet-600 px-6 py-4 text-base font-semibold text-white shadow-lg transition-all hover:bg-violet-700 hover:shadow-xl disabled:opacity-50"
                >
                  {generating ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner /> Generating your strategy document...
                    </span>
                  ) : (
                    "Generate Strategy Document"
                  )}
                </button>
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 mb-4">
                    <svg className="h-7 w-7 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-emerald-900">Strategy document generated</h3>
                  <p className="text-sm text-emerald-700 mt-1">
                    Your professional content strategy is ready.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    {pdfUrl && (
                      <a
                        href={pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Download PDF
                      </a>
                    )}
                    {shareLink && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(shareLink);
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                        Copy share link
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </StepCard>
        )}
      </div>

      {/* ═══ Navigation Buttons ═══ */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white/90 backdrop-blur-md border-t border-gray-100">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-6 py-4">
          <button
            onClick={goBack}
            disabled={currentStep <= 1 || saving}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          <div className="flex items-center gap-3">
            {saving && (
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <Spinner /> Saving...
              </span>
            )}
            <span className="text-xs text-gray-400">
              Step {currentStep} of 8
            </span>
          </div>

          {currentStep < 8 ? (
            <button
              onClick={goNext}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow transition-all hover:bg-violet-700 hover:shadow-lg disabled:opacity-50"
            >
              Next
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <div /> /* Empty div to maintain flex spacing on last step */
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

function StepCard({
  number,
  title,
  subtitle,
  children,
}: {
  number: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="h-1 bg-violet-600" />
      <div className="p-8">
        <div className="flex items-center gap-3 mb-1">
          <span className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white tracking-wider">
            {String(number).padStart(2, "0")}
          </span>
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        </div>
        <p className="text-sm text-gray-500 mb-8 ml-12">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  compact,
  children,
}: {
  label: string;
  hint?: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={`block font-medium text-gray-700 ${compact ? "text-xs mb-1" : "text-sm mb-1.5"}`}>
        {label}
        {hint && <span className="ml-1.5 font-normal text-gray-400 text-xs">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
