"use client";

import { useState } from "react";
import type { StructuredVoice, ToneSpectrum, HumourType, WritingSample, BannedWordsCategory } from "@/types/voice";
import { DEFAULT_STRUCTURED_VOICE } from "@/types/voice";

interface StructuredVoiceFormProps {
  initial: StructuredVoice | null;
  personName: string;
  onSave: (voice: StructuredVoice) => Promise<void>;
  saving: boolean;
}

const TONE_SCALES: { key: keyof ToneSpectrum; left: string; right: string }[] = [
  { key: "formal_to_casual", left: "Formal", right: "Casual" },
  { key: "serious_to_playful", left: "Serious", right: "Playful" },
  { key: "authoritative_to_humble", left: "Authoritative", right: "Humble" },
  { key: "reserved_to_enthusiastic", left: "Reserved", right: "Enthusiastic" },
  { key: "cautious_to_bold", left: "Cautious", right: "Bold" },
];

const HUMOUR_OPTIONS: { value: HumourType; label: string; desc: string }[] = [
  { value: "ironic_juxtaposition", label: "Ironic Juxtaposition", desc: "Placing serious and absurd side-by-side" },
  { value: "self_deprecating", label: "Self-Deprecating", desc: "Gentle jokes about own mistakes" },
  { value: "deadpan_observation", label: "Deadpan Observation", desc: "Stating the obvious with dry delivery" },
  { value: "warm_understatement", label: "Warm Understatement", desc: "Expressing care through restraint" },
  { value: "gentle_teasing", label: "Gentle Teasing", desc: "Affectionate ribbing of industry/peers" },
  { value: "dry_callback", label: "Dry Callback", desc: "Referencing earlier points with timing" },
  { value: "shared_dysfunction", label: "Shared Dysfunction", desc: "\"We all know this is broken\"" },
  { value: "none", label: "No Humour", desc: "Straight, professional tone throughout" },
];

const DEFAULT_BANNED_CATEGORIES: BannedWordsCategory[] = [
  { category: "Corporate", words: ["leverage", "optimise", "comprehensive", "robust", "synergy", "ecosystem", "best practices", "impactful", "stakeholder"] },
  { category: "Gushing", words: ["game-changer", "revolutionary", "exciting", "astounding", "fascinating", "remarkable", "incredible", "amazing"] },
  { category: "AI Buzzwords", words: ["delve", "landscape", "navigate", "pivotal", "streamline", "foster", "harness", "cutting-edge", "in today's fast-paced"] },
  { category: "Hollow Validation", words: ["resonates", "this tracks", "powerful", "spot on", "nailed it", "exactly right", "crucial"] },
  { category: "Empty Closers", words: ["best of luck", "wishing you all the best", "exciting times", "let's connect"] },
];

export default function StructuredVoiceForm({ initial, personName, onSave, saving }: StructuredVoiceFormProps) {
  const [v, setV] = useState<StructuredVoice>(initial || DEFAULT_STRUCTURED_VOICE);
  const [activeTab, setActiveTab] = useState<"identity" | "tone" | "formatting" | "words" | "samples">("identity");

  // Helper to update nested state
  function update(path: string, value: unknown) {
    setV((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as StructuredVoice;
      const keys = path.split(".");
      let obj: Record<string, unknown> = next as unknown as Record<string, unknown>;
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]] as Record<string, unknown>;
      }
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  }

  function toggleHumour(type: HumourType) {
    const current = v.humour_types;
    if (type === "none") {
      update("humour_types", ["none"]);
      return;
    }
    const filtered = current.filter((t) => t !== "none");
    if (filtered.includes(type)) {
      update("humour_types", filtered.filter((t) => t !== type));
    } else {
      update("humour_types", [...filtered, type]);
    }
  }

  function addWritingSample() {
    update("writing_samples", [...v.writing_samples, { text: "", label: "", post_type: "" }]);
  }

  function updateSample(index: number, field: keyof WritingSample, value: string) {
    const updated = [...v.writing_samples];
    updated[index] = { ...updated[index], [field]: value };
    update("writing_samples", updated);
  }

  function removeSample(index: number) {
    update("writing_samples", v.writing_samples.filter((_, i) => i !== index));
  }

  function initBannedWords() {
    if (v.banned_words.every((c) => c.words.length === 0)) {
      update("banned_words", DEFAULT_BANNED_CATEGORIES);
    }
  }

  function updateBannedCategory(index: number, words: string) {
    const updated = [...v.banned_words];
    updated[index] = { ...updated[index], words: words.split(",").map((w) => w.trim()).filter(Boolean) };
    update("banned_words", updated);
  }

  function addBannedCategory() {
    update("banned_words", [...v.banned_words, { category: "Other", words: [] }]);
  }

  const TABS = [
    { key: "identity", label: "Identity & Tone" },
    { key: "tone", label: "Style & Humour" },
    { key: "formatting", label: "Formatting" },
    { key: "words", label: "Banned Words" },
    { key: "samples", label: "Writing Samples" },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Tab navigation */}
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── IDENTITY & TONE ── */}
      {activeTab === "identity" && (
        <div className="space-y-5">
          {/* Voice in 3 Words */}
          <div>
            <label className="block text-sm font-semibold text-gray-900">Voice in Three Words</label>
            <p className="text-xs text-gray-500 mb-2">Three adjectives that capture {personName}&apos;s voice</p>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <input
                  key={i}
                  type="text"
                  value={v.voice_three_words[i]}
                  onChange={(e) => {
                    const words = [...v.voice_three_words] as [string, string, string];
                    words[i] = e.target.value;
                    update("voice_three_words", words);
                  }}
                  placeholder={["e.g. Warm", "e.g. Pragmatic", "e.g. Sharp"][i]}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
                />
              ))}
            </div>
          </div>

          {/* Voice Character */}
          <div>
            <label className="block text-sm font-semibold text-gray-900">Voice Character</label>
            <p className="text-xs text-gray-500 mb-2">A casting brief. How does this person sound? Who do they remind you of?</p>
            <textarea
              value={v.voice_character}
              onChange={(e) => update("voice_character", e.target.value)}
              rows={3}
              placeholder="e.g. Sounds like a smart friend who works in the industry — knows the politics, shares openly, but never grandstands. Warm but never gushing. Says difficult things with a shrug and a half-smile."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </div>

          {/* Tone Spectrum */}
          <div>
            <label className="block text-sm font-semibold text-gray-900">Tone Spectrum</label>
            <p className="text-xs text-gray-500 mb-3">Where does {personName} sit on each scale?</p>
            <div className="space-y-4">
              {TONE_SCALES.map((scale) => (
                <div key={scale.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">{scale.left}</span>
                    <span className="text-xs text-gray-500">{scale.right}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        onClick={() => update(`tone_spectrum.${scale.key}`, val)}
                        className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors ${
                          v.tone_spectrum[scale.key] === val
                            ? "bg-violet-600 text-white"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Hedging */}
          <div>
            <label className="block text-sm font-semibold text-gray-900">Hedging vs Directness</label>
            <p className="text-xs text-gray-500 mb-2">How does {personName} state opinions?</p>
            <div className="flex gap-2">
              {(["tentative", "balanced", "direct"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => update("hedging_preference", opt)}
                  className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                    v.hedging_preference === opt
                      ? "border-violet-500 bg-violet-50 text-violet-700"
                      : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {opt === "tentative" ? "Tentative / Hedged" : opt === "balanced" ? "Balanced" : "Direct / Declarative"}
                </button>
              ))}
            </div>
            {v.hedging_preference === "tentative" && (
              <div className="mt-3">
                <label className="block text-xs text-gray-600 mb-1">Required hedging phrases (one per line)</label>
                <textarea
                  value={v.hedging_phrases.join("\n")}
                  onChange={(e) => update("hedging_phrases", e.target.value.split("\n").filter(Boolean))}
                  rows={4}
                  placeholder={"I think there's...\nProbably worth...\nFair to say...\nWhat I'd suggest is...\nWhat we've found is..."}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs font-mono focus:border-violet-500 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Peer Positioning */}
          <div>
            <label className="block text-sm font-semibold text-gray-900">Positioning</label>
            <p className="text-xs text-gray-500 mb-2">How does {personName} position themselves relative to the audience?</p>
            <div className="flex gap-2">
              {(["peer", "expert_above", "student_below"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => update("peer_positioning", opt)}
                  className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                    v.peer_positioning === opt
                      ? "border-violet-500 bg-violet-50 text-violet-700"
                      : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {opt === "peer" ? "Peer (alongside)" : opt === "expert_above" ? "Expert (authority)" : "Learner (humble)"}
                </button>
              ))}
            </div>
          </div>

          {/* Regional */}
          <div>
            <label className="block text-sm font-semibold text-gray-900">Regional Texture</label>
            <div className="flex gap-2 mt-1">
              {(["british", "american", "neutral", "other"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => update("regional_texture", opt)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    v.regional_texture === opt
                      ? "border-violet-500 bg-violet-50 text-violet-700"
                      : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── STYLE & HUMOUR ── */}
      {activeTab === "tone" && (
        <div className="space-y-5">
          {/* Humour Types */}
          <div>
            <label className="block text-sm font-semibold text-gray-900">Humour Style</label>
            <p className="text-xs text-gray-500 mb-3">Select all types of humour {personName} uses</p>
            <div className="space-y-2">
              {HUMOUR_OPTIONS.map((opt) => {
                const isSelected = v.humour_types.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggleHumour(opt.value)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      isSelected
                        ? "border-violet-500 bg-violet-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${
                        isSelected ? "border-violet-500 bg-violet-500" : "border-gray-300"
                      }`}>
                        {isSelected && (
                          <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-900">{opt.label}</span>
                        <span className="ml-2 text-xs text-gray-500">{opt.desc}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={v.humour_mandatory}
                onChange={(e) => update("humour_mandatory", e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-xs text-gray-700">Humour is mandatory (content without warmth sounds like someone else wrote it)</span>
            </label>
          </div>

          {/* Signature Devices */}
          <div>
            <label className="block text-sm font-semibold text-gray-900">Signature Devices</label>
            <p className="text-xs text-gray-500 mb-3">Recurring stylistic elements in {personName}&apos;s writing</p>
            <div className="space-y-2">
              {[
                { key: "bracketed_asides", label: "Bracketed Asides", desc: "\"(He wasn't wrong to be annoyed.)\" — adds texture and self-awareness" },
                { key: "question_tags", label: "Question Tags", desc: "\"Tough life, isn't it?\" — British conversational device" },
                { key: "british_interjections", label: "British Interjections", desc: "\"Blimey...\", \"Right then...\", \"Fair enough\"" },
                { key: "understatement", label: "Understatement", desc: "Expressing strong feelings through restraint" },
              ].map((device) => (
                <label key={device.key} className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={v.signature_devices[device.key as keyof typeof v.signature_devices] as boolean}
                    onChange={(e) => update(`signature_devices.${device.key}`, e.target.checked)}
                    className="mt-0.5 rounded border-gray-300"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900">{device.label}</span>
                    <p className="text-xs text-gray-500">{device.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-3">
              <label className="block text-xs text-gray-600 mb-1">Other signature devices (one per line)</label>
              <textarea
                value={v.signature_devices.other.join("\n")}
                onChange={(e) => update("signature_devices.other", e.target.value.split("\n").filter(Boolean))}
                rows={3}
                placeholder="e.g. Punchy follow-up sentences after long explanations&#10;e.g. Enumerated parallels with variation"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Opening Rules */}
          <div>
            <label className="block text-sm font-semibold text-gray-900">Opening Rules</label>
            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={v.opening_rules.never_start_with_i}
                onChange={(e) => update("opening_rules.never_start_with_i", e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-xs text-gray-700">Never open with &quot;I&quot; as the first word</span>
            </label>
            <div className="mt-2">
              <label className="block text-xs text-gray-600 mb-1">Preferred opener patterns (one per line)</label>
              <textarea
                value={v.opening_rules.preferred_openers.join("\n")}
                onChange={(e) => update("opening_rules.preferred_openers", e.target.value.split("\n").filter(Boolean))}
                rows={3}
                placeholder={"What I keep seeing...\nThere's a thing that happens...\nSomething came up recently..."}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs font-mono focus:border-violet-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── FORMATTING ── */}
      {activeTab === "formatting" && (
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-900">Formatting Rules</label>
            <p className="text-xs text-gray-500 mb-3">These rules are enforced in every piece of generated content</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Spelling</label>
              <div className="flex gap-2">
                {(["uk", "us"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => update("formatting_rules.spelling", opt)}
                    className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium ${
                      v.formatting_rules.spelling === opt
                        ? "border-violet-500 bg-violet-50 text-violet-700"
                        : "border-gray-200 text-gray-500"
                    }`}
                  >
                    {opt === "uk" ? "UK English" : "US English"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Max lines per paragraph</label>
              <input
                type="number"
                min={1}
                max={10}
                value={v.formatting_rules.paragraph_max_lines}
                onChange={(e) => update("formatting_rules.paragraph_max_lines", parseInt(e.target.value) || 2)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            {[
              { key: "em_dashes_allowed", label: "Em-dashes (—) allowed", invertLabel: true },
              { key: "exclamation_marks_allowed", label: "Exclamation marks allowed", invertLabel: true },
              { key: "emoji_in_body", label: "Emoji in body copy allowed", invertLabel: true },
              { key: "hashtags_in_body", label: "Hashtags in body copy (not just at end)", invertLabel: true },
              { key: "oxford_comma", label: "Use Oxford comma", invertLabel: false },
              { key: "contractions_allowed", label: "Contractions allowed (don't vs do not)", invertLabel: false },
            ].map((rule) => (
              <label key={rule.key} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={v.formatting_rules[rule.key as keyof typeof v.formatting_rules] as boolean}
                  onChange={(e) => update(`formatting_rules.${rule.key}`, e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">{rule.label}</span>
              </label>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Numbers style</label>
            <div className="flex gap-2">
              {([
                { val: "digits_for_stats", label: "Digits for stats, words for prose" },
                { val: "always_digits", label: "Always digits" },
                { val: "always_words", label: "Always words" },
              ] as const).map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => update("formatting_rules.numbers_style", opt.val)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium ${
                    v.formatting_rules.numbers_style === opt.val
                      ? "border-violet-500 bg-violet-50 text-violet-700"
                      : "border-gray-200 text-gray-500"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Other formatting rules (one per line)</label>
            <textarea
              value={v.formatting_rules.other_rules.join("\n")}
              onChange={(e) => update("formatting_rules.other_rules", e.target.value.split("\n").filter(Boolean))}
              rows={3}
              placeholder={"No colons or hyphens in titles/hooks\nNo en-dashes anywhere"}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* ── BANNED WORDS ── */}
      {activeTab === "words" && (
        <div className="space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <label className="block text-sm font-semibold text-gray-900">Banned Words and Phrases</label>
              <p className="text-xs text-gray-500">Words {personName} should NEVER use, organised by category</p>
            </div>
            {v.banned_words.every((c) => c.words.length === 0) && (
              <button
                onClick={initBannedWords}
                className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
              >
                Load defaults
              </button>
            )}
          </div>

          <div className="space-y-4">
            {v.banned_words.map((cat, i) => (
              <div key={i} className="rounded-lg border border-gray-200 p-4">
                <input
                  type="text"
                  value={cat.category}
                  onChange={(e) => {
                    const updated = [...v.banned_words];
                    updated[i] = { ...updated[i], category: e.target.value };
                    update("banned_words", updated);
                  }}
                  className="mb-2 block w-full text-sm font-semibold text-gray-900 border-none p-0 focus:outline-none"
                  placeholder="Category name"
                />
                <textarea
                  value={cat.words.join(", ")}
                  onChange={(e) => updateBannedCategory(i, e.target.value)}
                  rows={2}
                  placeholder="word1, word2, word3..."
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none"
                />
              </div>
            ))}
          </div>

          <button
            onClick={addBannedCategory}
            className="rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:border-violet-400 hover:text-violet-600"
          >
            + Add category
          </button>
        </div>
      )}

      {/* ── WRITING SAMPLES ── */}
      {activeTab === "samples" && (
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-900">Writing Samples</label>
            <p className="text-xs text-gray-500">
              Real examples of {personName}&apos;s writing. These are used as few-shot examples during generation,
              so the AI can match the actual voice pattern. 3-5 samples is ideal.
            </p>
          </div>

          <div className="space-y-4">
            {v.writing_samples.map((sample, i) => (
              <div key={i} className="rounded-lg border border-gray-200 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={sample.label || ""}
                    onChange={(e) => updateSample(i, "label", e.target.value)}
                    placeholder="Label (e.g. Monday Problem Post, Friday Personal)"
                    className="text-sm font-medium text-gray-900 border-none p-0 focus:outline-none flex-1"
                  />
                  <button
                    onClick={() => removeSample(i)}
                    className="text-xs text-red-500 hover:text-red-700 ml-2"
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  value={sample.text}
                  onChange={(e) => updateSample(i, "text", e.target.value)}
                  rows={5}
                  placeholder="Paste a real post or writing sample here..."
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none"
                />
              </div>
            ))}
          </div>

          <button
            onClick={addWritingSample}
            className="rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:border-violet-400 hover:text-violet-600"
          >
            + Add writing sample
          </button>
        </div>
      )}

      {/* Save button (always visible) */}
      <div className="border-t border-gray-200 pt-4">
        <button
          onClick={() => onSave(v)}
          disabled={saving}
          className="rounded-md bg-gray-900 px-6 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Voice Profile"}
        </button>
      </div>
    </div>
  );
}
