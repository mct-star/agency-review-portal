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
  | "pdf_guide";
export type NotificationType =
  | "content_ready"
  | "piece_approved"
  | "changes_requested"
  | "comment_added";

export interface Company {
  id: string;
  name: string;
  slug: string;
  spokesperson_name: string | null;
  logo_url: string | null;
  brand_color: string | null;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  company_id: string | null;
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

// Extended types with joins
export interface WeekWithPieces extends Week {
  content_pieces: ContentPiece[];
  company?: Company;
}

export interface ContentPieceWithImages extends ContentPiece {
  content_images: ContentImage[];
  comments: Comment[];
}
