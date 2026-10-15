/**
 * Shared interface for all publishing providers (YouTube, etc.)
 */
export interface PublishingProvider {
  publish(input: PublishInput): Promise<PublishOutput>;
  getStatus?(externalId: string): Promise<PublishingStatus>;
}

export interface PublishInput {
  title: string;
  content: string;           // HTML or markdown body
  canonicalUrl?: string;      // rel=canonical for SEO
  subtitle?: string;          // Kicker or subtitle
  tags?: string[];
  mediaUrls?: string[];       // Cover image, video file, etc.
  scheduledFor?: string;      // ISO datetime for scheduled publishing
  sendNewsletter?: boolean;   // Send as an email newsletter
  metadata?: Record<string, unknown>;
}

export interface PublishOutput {
  externalId: string;
  externalUrl: string;
  status: "published" | "scheduled" | "processing" | "draft";
}

export interface PublishingStatus {
  status: "published" | "scheduled" | "processing" | "draft" | "failed";
  externalUrl?: string;
  publishedAt?: string;
  error?: string;
}
