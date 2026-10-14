"use client";

import { GROUP_LABELS, TAG_GROUPS, TAG_VOCABULARY, readableTag, tagKey, toggleTag } from "@/lib/media/vocabulary";

/**
 * Click to switch a tag on or off. Each group of the fixed vocabulary is a
 * row of buttons, so correcting what the automatic tagger got wrong is one
 * tap, not typing. Every tap saves straight away.
 */
export default function TagEditor({
  tags,
  onChange,
  size = "md",
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs";
  const custom = tags.filter((t) => !t.includes(":"));
  return (
    <div className="space-y-3">
      {TAG_GROUPS.map((group) => (
        <div key={group}>
          <p className="mb-1 text-xs font-medium text-gray-700">{GROUP_LABELS[group]}</p>
          <div className="flex flex-wrap gap-1.5">
            {TAG_VOCABULARY[group].map((value) => {
              const key = tagKey(group, value);
              const on = tags.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange(toggleTag(tags, key))}
                  className={`rounded-full border ${pad} ${on ? "border-violet-600 bg-violet-600 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-violet-300"}`}
                >
                  {readableTag(value)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {custom.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-gray-700">Your own tags</p>
          <div className="flex flex-wrap gap-1.5">
            {custom.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange(tags.filter((x) => x !== t))}
                className={`rounded-full border border-gray-300 bg-gray-100 ${pad} text-gray-700 hover:bg-gray-200`}
                title="Click to remove"
              >
                {t} x
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
