"use client";

import { useState } from "react";
import LinkedInPreview from "./LinkedInPreview";
import MarkdownRenderer from "./MarkdownRenderer";
import type { ContentPiece, ContentImage, ContentAsset } from "@/types/database";

type ReviewTab = "social" | "blog" | "article" | "assets";

interface PieceWithExtras extends ContentPiece {
  images: ContentImage[];
  assets: ContentAsset[];
}

interface WeekReviewTabsProps {
  socialPieces: PieceWithExtras[];
  blogPieces: PieceWithExtras[];
  articlePieces: PieceWithExtras[];
  allPieces: PieceWithExtras[];
  authorName: string;
  authorTagline?: string;
  authorAvatarUrl?: string;
  brandColor?: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  approved: "bg-green-100 text-green-700",
  changes_requested: "bg-amber-100 text-amber-700",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  changes_requested: "Changes Requested",
};

export default function WeekReviewTabs({
  socialPieces,
  blogPieces,
  articlePieces,
  allPieces,
  authorName,
  authorTagline,
  authorAvatarUrl,
  brandColor,
}: WeekReviewTabsProps) {
  const [activeTab, setActiveTab] = useState<ReviewTab>("social");
  // Track which social posts are expanded (show full LinkedIn preview)
  const [expandedPieces, setExpandedPieces] = useState<Set<string>>(new Set());
  // Track image generation state per piece
  const [generatingImage, setGeneratingImage] = useState<Set<string>>(new Set());
  const [generatedImages, setGeneratedImages] = useState<Map<string, string>>(new Map());

  const handleGenerateImage = async (pieceId: string, companyId: string) => {
    // Find the image prompt from the piece's assets
    const piece = allPieces.find((p) => p.id === pieceId);
    const imagePromptAsset = piece?.assets.find((a) => a.asset_type === "image_prompt");
    if (!imagePromptAsset?.text_content) return;

    setGeneratingImage((prev) => new Set(prev).add(pieceId));
    try {
      const res = await fetch("/api/generate/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          contentPieceId: pieceId,
          // Must be an array of objects — bare strings cause prompt to be undefined
          prompts: [{ prompt: imagePromptAsset.text_content, style: "A4_pixar", aspectRatio: "1:1" }],
        }),
      });
      const data = await res.json();
      // API returns DB rows: field is public_url, not url
      if (res.ok && data.images?.[0]?.public_url) {
        setGeneratedImages((prev) => new Map(prev).set(pieceId, data.images[0].public_url));
      }
    } finally {
      setGeneratingImage((prev) => {
        const next = new Set(prev);
        next.delete(pieceId);
        return next;
      });
    }
  };

  // Build tabs based on what content exists
  const tabs: { id: ReviewTab; label: string; count: number }[] = [
    { id: "social", label: "Social Posts", count: socialPieces.length },
    ...(blogPieces.length > 0
      ? [{ id: "blog" as ReviewTab, label: "Blog", count: blogPieces.length }]
      : []),
    ...(articlePieces.length > 0
      ? [{ id: "article" as ReviewTab, label: "LinkedIn Article", count: articlePieces.length }]
      : []),
    { id: "assets", label: "Assets", count: allPieces.reduce((sum, p) => sum + p.assets.length, 0) },
  ];

  const toggleExpand = (pieceId: string) => {
    setExpandedPieces((prev) => {
      const next = new Set(prev);
      if (next.has(pieceId)) {
        next.delete(pieceId);
      } else {
        next.add(pieceId);
      }
      return next;
    });
  };

  // Sort social pieces by day_of_week order
  const sortedSocialPieces = [...socialPieces].sort((a, b) => {
    const dayA = a.day_of_week ? DAY_NAMES.indexOf(a.day_of_week) : a.sort_order;
    const dayB = b.day_of_week ? DAY_NAMES.indexOf(b.day_of_week) : b.sort_order;
    if (dayA !== dayB) return dayA - dayB;
    // Same day — sort by time
    return (a.scheduled_time || "").localeCompare(b.scheduled_time || "");
  });

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                activeTab === tab.id
                  ? "bg-gray-100 text-gray-600"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Social Posts tab */}
      {activeTab === "social" && (
        <div className="space-y-6">
          {sortedSocialPieces.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
              <p className="text-gray-500">No social posts in this week.</p>
            </div>
          ) : (
            sortedSocialPieces.map((piece) => {
              const isExpanded = expandedPieces.has(piece.id);
              const previewImage = generatedImages.get(piece.id) || (piece.images.length > 0 ? piece.images[0].public_url : null);
              const hasImagePrompt = piece.assets.some((a) => a.asset_type === "image_prompt");
              const needsImage = !previewImage && hasImagePrompt;
              const isGenerating = generatingImage.has(piece.id);

              return (
                <div key={piece.id} className="rounded-lg border border-gray-200 bg-white">
                  {/* Piece header — always visible */}
                  <div className="flex items-center justify-between border-b border-gray-100 p-4">
                    <div className="flex items-center gap-3">
                      {/* Day badge */}
                      <div className="flex flex-col items-center rounded-lg bg-gray-50 px-3 py-1.5">
                        <span className="text-[10px] font-medium uppercase text-gray-400">
                          {piece.day_of_week || `#${piece.sort_order + 1}`}
                        </span>
                        {piece.scheduled_time && (
                          <span className="text-xs font-semibold text-gray-600">
                            {piece.scheduled_time.slice(0, 5)}
                          </span>
                        )}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">{piece.title}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          {piece.post_type && (
                            <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-600">
                              {piece.post_type}
                            </span>
                          )}
                          {piece.pillar && (
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                              {piece.pillar}
                            </span>
                          )}
                          {piece.word_count && (
                            <span className="text-[10px] text-gray-400">
                              {piece.word_count} words
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Image thumbnail */}
                      {previewImage && (
                        <img src={previewImage} alt="" className="h-10 w-10 rounded-md object-cover border border-gray-200" />
                      )}
                      {/* Generate Image button */}
                      {needsImage && (
                        <button
                          onClick={() => handleGenerateImage(piece.id, piece.company_id)}
                          disabled={isGenerating}
                          className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
                        >
                          {isGenerating ? (
                            <span className="flex items-center gap-1">
                              <span className="h-3 w-3 animate-spin rounded-full border border-amber-300 border-t-amber-600" />
                              Generating...
                            </span>
                          ) : (
                            "Generate Image"
                          )}
                        </button>
                      )}
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          STATUS_STYLES[piece.approval_status] || STATUS_STYLES.pending
                        }`}
                      >
                        {STATUS_LABELS[piece.approval_status] || piece.approval_status}
                      </span>
                      <button
                        onClick={() => toggleExpand(piece.id)}
                        className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                      >
                        {isExpanded ? "Collapse" : "Preview"}
                      </button>
                    </div>
                  </div>

                  {/* LinkedIn preview — expandable */}
                  {isExpanded && (
                    <div className="bg-gray-50 p-6">
                      <LinkedInPreview
                        authorName={authorName}
                        authorTagline={authorTagline}
                        authorAvatarUrl={authorAvatarUrl}
                        postText={piece.markdown_body}
                        firstComment={piece.first_comment}
                        postType={piece.post_type}
                        imageUrl={previewImage}
                        brandColor={brandColor}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Blog tab — full article with images inline + SEO assets */}
      {activeTab === "blog" && (
        <div className="space-y-6">
          {blogPieces.map((piece) => {
            const seoAssets = piece.assets.filter(
              (a) => a.asset_type === "seo_title" || a.asset_type === "seo_meta_description" || a.asset_type === "url_slug" || a.asset_type === "excerpt"
            );
            const coverImage = piece.images.find((img) => img.filename?.includes("cover") || img.sort_order === 0);
            const inlineImages = piece.images.filter((img) => img !== coverImage);

            return (
              <div key={piece.id} className="rounded-lg border border-gray-200 bg-white">
                {/* Blog header with cover image */}
                {coverImage && (
                  <img
                    src={coverImage.public_url}
                    alt={piece.title}
                    className="w-full rounded-t-lg object-cover"
                    style={{ maxHeight: "300px" }}
                  />
                )}

                <div className="border-b border-gray-100 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">{piece.title}</h2>
                      <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                        {piece.word_count && (
                          <span>{piece.word_count.toLocaleString()} words</span>
                        )}
                        {piece.pillar && (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium">
                            {piece.pillar}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        STATUS_STYLES[piece.approval_status] || STATUS_STYLES.pending
                      }`}
                    >
                      {STATUS_LABELS[piece.approval_status] || piece.approval_status}
                    </span>
                  </div>
                </div>

                {/* SEO assets bar */}
                {seoAssets.length > 0 && (
                  <div className="border-b border-gray-100 bg-blue-50 px-4 py-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase text-blue-500">SEO Assets</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {seoAssets.map((asset) => (
                        <div key={asset.id} className="text-xs">
                          <span className="font-medium text-blue-600">
                            {asset.asset_type.replace(/_/g, " ")}:
                          </span>
                          <span className="ml-1 text-blue-900">{asset.text_content}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Blog body with inline images */}
                <div className="p-6">
                  <MarkdownRenderer content={piece.markdown_body} />

                  {/* Inline images grid */}
                  {inlineImages.length > 0 && (
                    <div className="mt-6 border-t border-gray-100 pt-4">
                      <p className="mb-3 text-xs font-semibold uppercase text-gray-400">Article Images</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {inlineImages.map((img) => (
                          <div key={img.id} className="space-y-1">
                            <img
                              src={img.public_url}
                              alt={img.filename}
                              className="rounded-lg border border-gray-200"
                            />
                            <p className="text-[10px] text-gray-400">{img.filename}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* First comment */}
                {piece.first_comment && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase text-gray-400">First Comment</p>
                    <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{piece.first_comment}</p>
                  </div>
                )}
              </div>
            );
          })}
          {blogPieces.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
              <p className="text-gray-500">No blog articles in this week.</p>
            </div>
          )}
        </div>
      )}

      {/* LinkedIn Article tab — with images + SEO assets */}
      {activeTab === "article" && (
        <div className="space-y-6">
          {articlePieces.map((piece) => {
            const seoAssets = piece.assets.filter(
              (a) => a.asset_type === "seo_title" || a.asset_type === "seo_meta_description" || a.asset_type === "excerpt"
            );
            const headerImage = piece.images.find((img) => img.sort_order === 0);
            const bodyImages = piece.images.filter((img) => img !== headerImage);

            return (
              <div key={piece.id} className="rounded-lg border border-gray-200 bg-white">
                {/* Header image */}
                {headerImage && (
                  <img
                    src={headerImage.public_url}
                    alt={piece.title}
                    className="w-full rounded-t-lg object-cover"
                    style={{ maxHeight: "250px" }}
                  />
                )}

                <div className="border-b border-gray-100 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">{piece.title}</h2>
                      <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                        {piece.word_count && (
                          <span>{piece.word_count.toLocaleString()} words</span>
                        )}
                        <span className="text-xs text-gray-400">LinkedIn Article</span>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        STATUS_STYLES[piece.approval_status] || STATUS_STYLES.pending
                      }`}
                    >
                      {STATUS_LABELS[piece.approval_status] || piece.approval_status}
                    </span>
                  </div>
                </div>

                {/* SEO assets */}
                {seoAssets.length > 0 && (
                  <div className="border-b border-gray-100 bg-blue-50 px-4 py-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase text-blue-500">SEO Assets</p>
                    <div className="space-y-1">
                      {seoAssets.map((asset) => (
                        <div key={asset.id} className="text-xs">
                          <span className="font-medium text-blue-600">{asset.asset_type.replace(/_/g, " ")}:</span>
                          <span className="ml-1 text-blue-900">{asset.text_content}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Article body */}
                <div className="p-6">
                  <MarkdownRenderer content={piece.markdown_body} />

                  {bodyImages.length > 0 && (
                    <div className="mt-6 border-t border-gray-100 pt-4">
                      <p className="mb-3 text-xs font-semibold uppercase text-gray-400">In-Article Images</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {bodyImages.map((img) => (
                          <div key={img.id} className="space-y-1">
                            <img src={img.public_url} alt={img.filename} className="rounded-lg border border-gray-200" />
                            <p className="text-[10px] text-gray-400">{img.filename}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {piece.first_comment && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase text-gray-400">First Comment</p>
                    <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{piece.first_comment}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Assets tab */}
      {activeTab === "assets" && (
        <div className="space-y-6">
          {allPieces.map((piece) => {
            const imagePrompts = piece.assets.filter((a) => a.asset_type === "image_prompt");
            const seoAssets = piece.assets.filter(
              (a) => a.asset_type === "seo_title" || a.asset_type === "seo_meta_description" || a.asset_type === "url_slug"
            );
            const otherAssets = piece.assets.filter(
              (a) => a.asset_type !== "image_prompt" && a.asset_type !== "seo_title" && a.asset_type !== "seo_meta_description" && a.asset_type !== "url_slug"
            );

            if (piece.assets.length === 0 && piece.images.length === 0) return null;

            return (
              <div key={piece.id} className="rounded-lg border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-gray-900">{piece.title}</h3>
                  <span className="text-xs text-gray-400">
                    {piece.day_of_week || piece.content_type}
                  </span>
                </div>
                <div className="space-y-4 p-4">
                  {/* Image prompts */}
                  {imagePrompts.map((asset) => (
                    <div key={asset.id} className="rounded-md bg-amber-50 p-3">
                      <h4 className="text-xs font-semibold uppercase text-amber-600">Image Prompt</h4>
                      <p className="mt-1 text-sm text-amber-900 whitespace-pre-wrap">
                        {asset.text_content}
                      </p>
                    </div>
                  ))}

                  {/* Generated images */}
                  {piece.images.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {piece.images.map((img) => (
                        <div key={img.id} className="space-y-1">
                          <img
                            src={img.public_url}
                            alt={img.filename}
                            className="rounded-lg border border-gray-200"
                          />
                          <p className="text-xs text-gray-500">{img.filename}</p>
                          {img.archetype && (
                            <p className="text-xs text-gray-400">{img.archetype}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* SEO assets */}
                  {seoAssets.length > 0 && (
                    <div className="rounded-md bg-blue-50 p-3">
                      <h4 className="mb-2 text-xs font-semibold uppercase text-blue-600">SEO</h4>
                      {seoAssets.map((asset) => (
                        <div key={asset.id} className="mt-1">
                          <span className="text-xs font-medium text-blue-500">
                            {asset.asset_type.replace(/_/g, " ")}:
                          </span>
                          <span className="ml-2 text-sm text-blue-900">
                            {asset.text_content}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Other assets */}
                  {otherAssets.map((asset) => (
                    <div key={asset.id} className="rounded-md bg-gray-50 p-3">
                      <h4 className="text-xs font-semibold uppercase text-gray-500">
                        {asset.asset_type.replace(/_/g, " ")}
                      </h4>
                      <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
                        {asset.text_content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {allPieces.every((p) => p.assets.length === 0 && p.images.length === 0) && (
            <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
              <p className="text-gray-500">No assets generated yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
