// ============================================================
// Core enums (existing)
// ============================================================

export type UserRole = "admin" | "client";
export type WeekStatus =
  | "draft"
  | "ready_for_review"
  | "approved"
  | "changes_requested";
export type ApprovalStatus = "pending" | "approved" | "changes_requested";
export type ContentType =
  | "social_post"
  | "blog_article"
  | "linkedin_article"
  | "pdf_guide"
  | "video_script";
export type NotificationType =
  | "content_ready"
  | "piece_approved"
  | "changes_requested"
  | "comment_added"
  | "generation_complete"
  | "generation_failed"
  | "publishing_complete"
  | "publishing_failed";

// ============================================================
// New enums (content operating system)
// ============================================================

export type ServiceCategory =
  | "image_generation"
  | "content_generation"
  | "blog_publishing"
  | "social_scheduling"
  | "video_rendering"
  | "transcription"
  | "newsletter_publishing"
  | "content_syndication"
  | "video_hosting";

// All destinations where content can be distributed
export type DistributionPlatform =
  // Social platforms
  | "linkedin_personal"
  | "linkedin_company"
  | "twitter"
  | "bluesky"
  | "threads"
  | "facebook"
  | "instagram"
  | "tiktok"
  // Content/newsletter platforms
  | "substack"
  | "medium"
  // Video platforms
  | "youtube"
  | "youtube_shorts";

// Subset type for backward compatibility — social-only platforms
export type SocialPlatform = Extract<
  DistributionPlatform,
  | "linkedin_personal"
  | "linkedin_company"
  | "twitter"
  | "bluesky"
  | "threads"
  | "facebook"
  | "instagram"
  | "tiktok"
>;

export type ContentPlatform = Extract<DistributionPlatform, "substack" | "medium">;
export type VideoPlatform = Extract<DistributionPlatform, "youtube" | "youtube_shorts">;

// How content is transformed for a given platform
export type AdaptationType =
  | "copy_adapt"         // Single post adaptation (current default)
  | "thread_expand"      // Multi-part thread (Twitter threads)
  | "link_post"          // Short copy + URL for sharing articles
  | "promo_post"         // Promotional copy for PDFs/guides
  | "caption_generate"   // Image/video captions (Instagram, TikTok)
  | "newsletter_format"  // Article formatted for newsletter delivery
  | "article_syndicate"  // Article cross-posted with canonical URL
  | "video_metadata";    // Title, description, tags for video uploads

export type AssetType =
  | "seo_title"
  | "seo_meta_description"
  | "url_slug"
  | "excerpt"
  | "categories_tags"
  | "featured_image"
  | "social_share_image"
  | "in_article_image"
  | "header_image"
  | "personal_distribution_copy"
  | "company_distribution_copy"
  | "newsletter_name"
  | "pdf_file"
  | "cover_image"
  | "page_zone_spec"
  | "script_text"
  | "storyboard"
  | "intro_outro_spec"
  | "broll_timestamps"
  | "subtitle_cues"
  | "platform_copy"
  | "image_prompt"
  | "cover_image_prompt"
  | "hero_image_prompt"
  | "header_image_prompt"
  | "in_article_image_prompt_1"
  | "in_article_image_prompt_2"
  | "in_article_image_prompt_3"
  | "infographic_prompt"
  | "custom";

export type GenerationJobType =
  | "content_generation"
  | "image_generation"
  | "video_rendering"
  | "transcription"
  | "pdf_generation"
  | "platform_adaptation";

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type PublishingStatus =
  | "queued"
  | "running"
  | "published"
  | "failed"
  | "scheduled"
  | "cancelled";

// ============================================================
// Existing interfaces
// ============================================================

export type ContentStrategyMode = "cohesive" | "variety";

export type ImageGenerationStatus =
  | "pending"
  | "generating"
  | "completed"
  | "failed"
  | "skipped";

export type PlanTier = "free" | "starter" | "pro" | "agency";

export type RegulatoryStatus = "pending" | "clean" | "flagged" | "approved";

export type RegulatoryRiskLevel = "low" | "medium" | "high" | "critical";

export interface RegulatoryIssueResult {
  sentence: string;
  riskLevel: "low" | "medium" | "high";
  category: "medical_claim" | "off_label" | "misleading" | "missing_disclaimer" | "competitor_reference" | "brand" | "product" | "service" | "formatting" | "claims" | "audience" | "channel";
  explanation: string;
  suggestion: string;
  regulation: string;
  countries?: string[];
}

export interface RegulatoryReviewResult {
  overallScore: number;
  riskLevel: RegulatoryRiskLevel;
  framework: string;
  issues: RegulatoryIssueResult[];
  passedChecks: string[];
  reviewedAt: string;
  targetCountries: string[];
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  plan: PlanTier;
  spokesperson_name: string | null;
  spokesperson_tagline: string | null;
  logo_url: string | null;
  profile_picture_url: string | null;
  brand_color: string | null;
  content_strategy_mode: ContentStrategyMode;
  blog_base_url: string | null;
  regulatory_framework: string | null;
  auto_regulatory_review: boolean;
  preferred_image_styles: string[] | null;
  post_type_image_mapping: Record<string, { imageStyle: string; color?: string; characterDescription?: string }> | null;
  trial_started_at: string | null;
  trial_expires_at: string | null;
  trial_plan: PlanTier | null;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  company_id: string | null;
  can_publish: boolean;
  created_at: string;
}

export interface Week {
  id: string;
  company_id: string;
  week_number: number;
  year: number;
  date_start: string;
  date_end: string;
  title: string | null;
  pillar: string | null;
  theme: string | null;
  subject: string | null;
  status: WeekStatus;
  created_at: string;
  updated_at: string;
}

export interface ContentPiece {
  id: string;
  week_id: string;
  company_id: string;
  content_type: ContentType;
  title: string;
  day_of_week: string | null;
  scheduled_time: string | null;
  markdown_body: string;
  first_comment: string | null;
  pillar: string | null;
  audience_theme: string | null;
  topic_bank_ref: string | null;
  word_count: number | null;
  post_type: string | null;
  sort_order: number;
  approval_status: ApprovalStatus;
  generation_job_id: string | null;
  image_generation_status: ImageGenerationStatus;
  ecosystem_role: string | null;
  cta_tier_used: string | null;
  regulatory_status: RegulatoryStatus;
  regulatory_score: number | null;
  regulatory_review: RegulatoryReviewResult | null;
  regulatory_framework: string | null;
  regulatory_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentImage {
  id: string;
  content_piece_id: string;
  filename: string;
  storage_path: string;
  public_url: string;
  archetype: string | null;
  dimensions: string | null;
  sort_order: number;
  created_at: string;
}

export interface Comment {
  id: string;
  content_piece_id: string;
  user_id: string;
  body: string;
  created_at: string;
  user?: User;
}

export interface Notification {
  id: string;
  recipient_user_id: string;
  type: NotificationType;
  week_id: string | null;
  content_piece_id: string | null;
  message: string;
  read: boolean;
  email_sent: boolean;
  created_at: string;
}

// ============================================================
// New interfaces (content operating system)
// ============================================================

export interface CompanyApiConfig {
  id: string;
  company_id: string;
  service_category: ServiceCategory;
  provider: string;
  credentials_encrypted: string | null;
  provider_settings: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanySocialAccount {
  id: string;
  company_id: string;
  platform: DistributionPlatform;
  account_name: string | null;
  account_id: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  platform_metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyBlueprint {
  id: string;
  company_id: string;
  version: string;
  blueprint_content: string;
  derived_source_context: string | null;
  derived_brand_context: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TopicBankEntry {
  id: string;
  company_id: string;
  topic_number: number;
  title: string;
  pillar: string | null;
  audience_theme: string | null;
  description: string | null;
  source_reference: string | null;
  is_used: boolean;
  used_in_week_id: string | null;
  created_at: string;
}

export interface ContentAsset {
  id: string;
  content_piece_id: string;
  asset_type: AssetType;
  text_content: string | null;
  file_url: string | null;
  storage_path: string | null;
  asset_metadata: Record<string, unknown>;
  sort_order: number;
  created_at: string;
}

export interface PlatformVariant {
  id: string;
  content_piece_id: string;
  social_account_id: string | null;
  platform: DistributionPlatform;
  adaptation_type: AdaptationType;
  adapted_copy: string;
  adapted_first_comment: string | null;
  character_count: number | null;
  hashtags: string[];
  mentions: string[];
  image_ids: string[];
  thread_parts: string[] | null;
  canonical_url: string | null;
  media_urls: string[] | null;
  scheduled_at: string | null;
  is_selected: boolean;
  platform_metadata: Record<string, unknown>;
  approval_status: ApprovalStatus;
  created_at: string;
  updated_at: string;
}

export interface ContentGenerationJob {
  id: string;
  company_id: string;
  week_id: string | null;
  content_piece_id: string | null;
  job_type: GenerationJobType;
  provider: string | null;
  status: JobStatus;
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown>;
  error_message: string | null;
  progress: number;
  started_at: string | null;
  completed_at: string | null;
  triggered_by: string | null;
  created_at: string;
}

export interface PublishingJob {
  id: string;
  company_id: string;
  content_piece_id: string | null;
  platform_variant_id: string | null;
  target_platform: string;
  api_config_id: string | null;
  social_account_id: string | null;
  status: PublishingStatus;
  external_id: string | null;
  external_url: string | null;
  canonical_url: string | null;
  publish_payload: Record<string, unknown>;
  response_payload: Record<string, unknown>;
  error_message: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  triggered_by: string | null;
  created_at: string;
}

export interface ContentSyndicationLink {
  id: string;
  content_piece_id: string;
  platform: DistributionPlatform;
  external_url: string;
  is_canonical: boolean;
  published_at: string | null;
  created_at: string;
}

// ============================================================
// Week ecosystem (interconnected content tracking)
// ============================================================

export interface WeekEcosystem {
  id: string;
  week_id: string;
  company_id: string;
  subject: string | null;
  blog_title: string | null;
  blog_url: string | null;
  article_title: string | null;
  article_url: string | null;
  pdf_guide_title: string | null;
  pdf_guide_url: string | null;
  cta_assignments: Record<string, { cta_tier: string; cta_url: string; cta_link_text: string }>;
  generation_status: 'pending' | 'generating' | 'completed' | 'partial' | 'failed';
  pieces_total: number;
  pieces_completed: number;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Posting schedule types
// ============================================================

export interface PostType {
  id: string;
  slug: string;
  label: string;
  content_type: ContentType;
  word_count_min: number | null;
  word_count_max: number | null;
  default_image_archetype: string | null;
  template_instructions: string | null;
  is_system: boolean;
  created_at: string;
}

export interface PostingSlot {
  id: string;
  company_id: string;
  post_type_id: string;
  day_of_week: number;
  scheduled_time: string;
  slot_label: string | null;
  image_archetype: string | null;
  cta_url: string | null;
  cta_link_text: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface PostingSlotWithType extends PostingSlot {
  post_types: PostType;
}

// ============================================================
// Setup section types
// ============================================================

export interface CompanySignoff {
  id: string;
  company_id: string;
  label: string;
  signoff_text: string;
  first_comment_template: string | null;
  applies_to_post_types: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface CompanyCtaUrl {
  id: string;
  company_id: string;
  label: string;
  url: string;
  link_text: string | null;
  cta_tier: 'primary' | 'secondary' | 'tertiary';
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export type VoiceSource = "manual" | "linkedin_scan";

export interface CompanyVoiceProfile {
  id: string;
  company_id: string;
  source: VoiceSource;
  voice_description: string | null;
  writing_samples: string | null;
  banned_vocabulary: string | null;
  signature_devices: string | null;
  emotional_register: string | null;
  raw_analysis: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export interface ContentTheme {
  id: string;
  company_id: string;
  theme_name: string;
  pillar: string | null;
  quarter: number | null;
  month: number | null;
  year: number | null;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export interface SetupProgress {
  id: string;
  company_id: string;
  step_strategy: boolean;
  step_schedule: boolean;
  step_topics: boolean;
  step_voice: boolean;
  step_signoffs: boolean;
  step_urls: boolean;
  step_api_keys: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Spokespersons (multiple per company)
// ============================================================

export interface CompanySpokesperson {
  id: string;
  company_id: string;
  name: string;
  tagline: string | null;
  profile_picture_url: string | null;
  linkedin_url: string | null;
  voice_profile_id: string | null;
  is_primary: boolean;
  is_active: boolean;
  sort_order: number;
  topic_assignments: unknown[] | null;
  posting_schedule: unknown[] | null;
  signoff_template: string | null;
  content_strategy: string | null;
  created_at: string;
}

// ============================================================
// Story bank + review documents
// ============================================================

export interface StoryBankEntry {
  id: string;
  company_id: string;
  title: string;
  story_text: string;
  category: string;
  tags: string[];
  pillar: string | null;
  is_used: boolean;
  used_count: number;
  last_used_in_week_id: string | null;
  created_at: string;
}

export interface ReviewDocument {
  id: string;
  week_id: string;
  company_id: string;
  compiled_content: string;
  quality_summary: Record<string, unknown>;
  compiled_at: string;
}

// ============================================================
// Extended types with joins
// ============================================================

export interface WeekWithPieces extends Week {
  content_pieces: ContentPiece[];
  company?: Company;
}

export interface ContentPieceWithImages extends ContentPiece {
  content_images: ContentImage[];
  comments: Comment[];
}

export interface ContentPieceWithAssets extends ContentPiece {
  content_images: ContentImage[];
  content_assets: ContentAsset[];
  platform_variants: PlatformVariant[];
  comments: Comment[];
}

export interface CompanyWithConfig extends Company {
  company_api_configs: CompanyApiConfig[];
  company_social_accounts: CompanySocialAccount[];
  company_blueprints: CompanyBlueprint[];
}

export interface WeekWithGenerationJobs extends Week {
  content_generation_jobs: ContentGenerationJob[];
}
