// ============================================================
// Core enums (existing)
// ============================================================

export type UserRole = "admin" | "client";
export type WeekStatus =
  | "draft"
  | "ready_for_review"
  | "approved"
  | "changes_requested";

// Week Board run-state axis. Deliberately separate from WeekStatus
// above, which is editorial review status and is untouched by the
// Week Board.
export type WeekRunState =
  | "idle"
  | "queued"
  | "running"
  | "failed"
  | "complete";
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

// Subset type for backward compatibility, social-only platforms
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
  | "platform_adaptation"
  | "weekly_production";

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
  run_state: WeekRunState;
  current_job_id: string | null;
  current_phase: string | null;
  last_error: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;

  // Migration 032. Photo supply tier and quarterly arc context, set
  // at planning time. Null until a weeks row exists for the ISO week,
  // which for weeks seeded via calendar_slots may be a while: see
  // CalendarSlot below, which carries its own week fields for exactly
  // that reason.
  photo_tier: WeekPhotoTier | null;
  tier_set_at: string | null;
  arc_movement: string | null;
  seasonality_note: string | null;
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
  heartbeat_at: string | null;
  lease_expires_at: string | null;
  worker_id: string | null;
  attempt: number;
  max_attempts: number;
  run_id: string | null;
  priority: number;
  created_at: string;
  updated_at: string | null;
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

// ============================================================
// Strategy Interview & Content Strategy
// ============================================================

export type StrategySessionStatus = "in_progress" | "completed" | "abandoned";

export interface StrategySession {
  id: string;
  company_id: string;
  current_step: number;
  status: StrategySessionStatus;
  responses: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface StrategyAudience {
  id: string;
  company_id: string;
  persona_name: string;
  job_title: string | null;
  seniority: string | null;
  primary_problem: string | null;
  search_terms: string[];
  pain_points: string[];
  sort_order: number;
  created_at: string;
}

export interface StrategyPositioning {
  id: string;
  company_id: string;
  positioning_statement: string | null;
  differentiators: string[];
  competitor_mistakes: string | null;
  transformation_before: string | null;
  transformation_after: string | null;
  storybrand_guide: string | null;
  created_at: string;
}

export interface StrategyNarrativeArc {
  id: string;
  company_id: string;
  week_number: number;
  phase: "establish" | "build" | "challenge" | "convert";
  theme_focus: string | null;
  topic_focus: string | null;
  post_type_emphasis: string[];
  notes: string | null;
  created_at: string;
}

export interface StrategyDocument {
  id: string;
  company_id: string;
  version: number;
  content: Record<string, unknown>;
  pdf_url: string | null;
  share_token: string | null;
  generated_at: string;
}

export type SetupComplexity = "beginner" | "intermediate" | "advanced";

// ============================================================
// Calendar slots: the content calendar as data (migration 032)
// ============================================================

export type WeekPhotoTier = "a" | "b" | "c";

export type CalendarSlotType = "thesis" | "doc" | "carousel" | "reactive";

export type CalendarSlotDayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type CalendarSlotSourceOwner =
  | "booksy"
  | "stratty_canon"
  | "amy"
  | "ppcy"
  | "voice_note"
  | "industry_radar";

export type CalendarSlotStatus =
  | "planned"
  | "briefed"
  | "written"
  | "shipped"
  | "dropped";

export type CalendarSlotCtaTier = "hot" | "warm" | "cool" | "none";

// One row per slot per week. week_id is nullable by design: rows are
// often seeded before their weeks row exists, so week_number/year/
// week_start_date are carried directly on the slot rather than only
// reachable through the FK. Treat any join to weeks as opportunistic.
export interface CalendarSlot {
  id: string;
  company_id: string;
  week_id: string | null;
  week_number: number;
  year: number;
  week_start_date: string;
  source_week_label: string | null;
  slot_date: string;
  day_of_week: CalendarSlotDayOfWeek;
  slot_type: CalendarSlotType;
  slot_role: string | null;
  post_type_slug: string | null;
  topic: string;
  pillar: string;
  theme: string | null;
  six_source_tags: string[] | null;
  source_owner: CalendarSlotSourceOwner;
  source_alternates: string[] | null;
  source_anchor: string | null;
  anchor_pending: boolean;
  image_direction: string | null;
  photo_needed: boolean;
  elu: string | null;
  elu_e: number | null;
  elu_l: number | null;
  elu_u: number | null;
  cta_tier: CalendarSlotCtaTier | null;
  status: CalendarSlotStatus;
  notes: string | null;
  seeded_from: string | null;
  seeded_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PhotoInventorySource = "photo_pack" | "weekly_capture" | "shoot";

// Migration 032 created this table around file_ref alone, when every
// photo lived in Google Drive. 033 added the storage columns, all
// nullable: null means the photo is not in Supabase Storage and
// file_ref is a Drive reference, not that the value is unknown.
export interface PhotoInventory {
  id: string;
  company_id: string;
  file_ref: string;
  scene_label: string | null;
  source: PhotoInventorySource;
  distinct_scene: boolean;
  used_in_weeks: number[];
  storage_path: string | null;
  bucket: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  original_filename: string | null;
  added_at: string;
  updated_at: string;
}
