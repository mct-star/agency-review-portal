"use client";

import { useEffect, useState } from "react";
import type { ContentAsset, AssetType } from "@/types/database";

interface ContentAssetsProps {
  pieceId: string;
  isAdmin: boolean;
}

const ASSET_TYPE_GROUPS: {
  label: string;
  types: { value: AssetType; label: string }[];
}[] = [
  {
    label: "SEO & Web",
    types: [
      { value: "seo_title", label: "SEO Title" },
      { value: "seo_meta_description", label: "Meta Description" },
      { value: "url_slug", label: "URL Slug" },
      { value: "excerpt", label: "Excerpt" },
      { value: "categories_tags", label: "Categories & Tags" },
    ],
  },
  {
    label: "Images",
    types: [
      { value: "featured_image", label: "Featured Image" },
      { value: "social_share_image", label: "Social Share Image" },
      { value: "in_article_image", label: "In-Article Image" },
      { value: "header_image", label: "Header Image" },
      { value: "cover_image", label: "Cover Image" },
    ],
  },
  {
    label: "Distribution",
    types: [
      { value: "personal_distribution_copy", label: "Personal Distribution" },
      { value: "company_distribution_copy", label: "Company Distribution" },
      { value: "newsletter_name", label: "Newsletter Name" },
      { value: "platform_copy", label: "Platform Copy" },
    ],
  },
  {
    label: "Video & Media",
    types: [
      { value: "script_text", label: "Script Text" },
      { value: "storyboard", label: "Storyboard" },
      { value: "intro_outro_spec", label: "Intro/Outro Spec" },
      { value: "broll_timestamps", label: "B-Roll Timestamps" },
      { value: "subtitle_cues", label: "Subtitle Cues" },
    ],
  },
  {
    label: "Other",
    types: [
      { value: "pdf_file", label: "PDF File" },
      { value: "page_zone_spec", label: "Page Zone Spec" },
      { value: "custom", label: "Custom" },
    ],
  },
];

export default function ContentAssets({ pieceId, isAdmin }: ContentAssetsProps) {
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  useEffect(() => {
    fetchAssets();
  }, [pieceId]);

  async function fetchAssets() {
    setLoading(true);
    const res = await fetch(`/api/assets?contentPieceId=${pieceId}`);
    const json = await res.json();
    setAssets(json.data || []);
    setLoading(false);
  }

  function getAssetsForType(assetType: AssetType): ContentAsset[] {
    return assets.filter((a) => a.asset_type === assetType);
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-400">Loading assets...</p>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-2 text-sm font-semibold text-gray-900">
          Content Assets
        </h3>
        <p className="text-sm text-gray-400">
          No assets generated yet. Assets are created during the content generation
          process.
        </p>
      </div>
    );
  }

  // Only show groups that have assets
  const populatedGroups = ASSET_TYPE_GROUPS.filter((group) =>
    group.types.some((t) => getAssetsForType(t.value).length > 0)
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">
        Content Assets ({assets.length})
      </h3>

      <div className="space-y-3">
        {populatedGroups.map((group) => {
          const groupAssets = group.types.flatMap((t) =>
            getAssetsForType(t.value)
          );
          if (groupAssets.length === 0) return null;

          const isExpanded = expandedGroup === group.label;

          return (
            <div
              key={group.label}
              className="rounded-md border border-gray-100"
            >
              <button
                onClick={() =>
                  setExpandedGroup(isExpanded ? null : group.label)
                }
                className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50"
              >
                <span className="text-sm font-medium text-gray-700">
                  {group.label}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    {groupAssets.length} item{groupAssets.length !== 1 ? "s" : ""}
                  </span>
                  <svg
                    className={`h-4 w-4 text-gray-400 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    />
                  </svg>
                </span>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                  {group.types.map((type) => {
                    const typeAssets = getAssetsForType(type.value);
                    if (typeAssets.length === 0) return null;

                    return typeAssets.map((asset) => (
                      <div key={asset.id} className="space-y-1">
                        <p className="text-xs font-medium uppercase text-gray-500">
                          {type.label}
                        </p>
                        {asset.text_content && (
                          <p className="text-sm text-gray-700 whitespace-pre-wrap rounded-md bg-gray-50 p-3">
                            {asset.text_content}
                          </p>
                        )}
                        {asset.file_url && (
                          <a
                            href={asset.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-sky-600 hover:text-sky-800"
                          >
                            View file →
                          </a>
                        )}
                      </div>
                    ));
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
