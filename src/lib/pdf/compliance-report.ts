/**
 * Compliance Report PDF Generator
 *
 * Generates a branded, professional PDF of a compliance review report
 * using PDFKit. Matches the on-screen report layout:
 *
 * Page 1: Header (logos, brand bar, title, metadata) + Score + Summary
 * Page 2+: Content review with inline colour highlights
 * Issues list with Legal/Regulatory/Compliance colour coding
 * Passed checks
 * Audit trail + disclaimer footer
 *
 * Three-colour system:
 * - Red (#DC2626): Legal — medical claims, off-label, misleading
 * - Amber (#D97706): Regulatory — disclaimers, claims, product classification
 * - Blue (#2563EB): Compliance — brand, audience, channel, formatting
 */

import PDFDocument from "pdfkit";
import type { RegulatoryReviewResult, RegulatoryIssueResult } from "@/types/database";

// ============================================================
// Types
// ============================================================

export interface ComplianceReportPdfConfig {
  // Report data
  review: RegulatoryReviewResult;
  markdownBody: string;
  firstComment: string | null;
  regulatoryScore: number;
  regulatoryStatus: string;

  // Company info
  companyName: string;
  brandColor: string;
  // logoUrl?: string; // TODO: Fetch and embed logo

  // Post info
  postTitle?: string;
  postType?: string;
  spokespersonName?: string;
  framework?: string;
  scheduledDate?: string;

  // Report metadata
  reportId: string;
  generatedAt: string;
}

// ============================================================
// Colour constants
// ============================================================

const COLORS = {
  // Brand
  headerBg: "#0F172A", // slate-900
  headerText: "#FFFFFF",
  accentViolet: "#7C3AED",

  // Three-colour compliance system
  legalRed: "#DC2626",
  legalBg: "#FEF2F2",
  regulatoryAmber: "#D97706",
  regulatoryBg: "#FFFBEB",
  complianceBlue: "#2563EB",
  complianceBg: "#EFF6FF",

  // UI
  sectionNumber: "#0F172A",
  bodyText: "#374151",
  mutedText: "#6B7280",
  lightGray: "#E5E7EB",
  scoreBg: "#F0FDF4",
  greenCheck: "#166534",
  passedBg: "#F0FDF4",

  // Score colours
  scoreGreen: "#166534",
  scoreAmber: "#A16207",
  scoreOrange: "#C2410C",
  scoreRed: "#991B1B",
};

function getScoreColor(score: number): string {
  if (score >= 80) return COLORS.scoreGreen;
  if (score >= 60) return COLORS.scoreAmber;
  if (score >= 40) return COLORS.scoreOrange;
  return COLORS.scoreRed;
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Compliant";
  if (score >= 60) return "Needs Attention";
  if (score >= 40) return "Concerns";
  return "Non-Compliant";
}

type ComplianceCategory = "legal" | "regulatory" | "compliance";

function getComplianceCategory(category: string): ComplianceCategory {
  const legalCategories = ["medical_claim", "off_label", "misleading", "competitor_reference"];
  const regulatoryCategories = ["missing_disclaimer", "claims", "product"];
  if (legalCategories.includes(category)) return "legal";
  if (regulatoryCategories.includes(category)) return "regulatory";
  return "compliance";
}

function getCategoryColor(cat: ComplianceCategory): string {
  switch (cat) {
    case "legal": return COLORS.legalRed;
    case "regulatory": return COLORS.regulatoryAmber;
    case "compliance": return COLORS.complianceBlue;
  }
}

function getCategoryBg(cat: ComplianceCategory): string {
  switch (cat) {
    case "legal": return COLORS.legalBg;
    case "regulatory": return COLORS.regulatoryBg;
    case "compliance": return COLORS.complianceBg;
  }
}

function getCategoryLabel(cat: ComplianceCategory): string {
  switch (cat) {
    case "legal": return "Legal";
    case "regulatory": return "Regulatory";
    case "compliance": return "Compliance";
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  medical_claim: "Medical Claim",
  off_label: "Off-Label",
  misleading: "Misleading",
  competitor_reference: "Competitor Ref",
  missing_disclaimer: "Missing Disclaimer",
  brand: "Brand",
  product: "Product",
  service: "Service",
  formatting: "Formatting",
  claims: "Claims",
  audience: "Audience",
  channel: "Channel",
};

// ============================================================
// PDF Generator
// ============================================================

export async function generateComplianceReportPdf(
  config: ComplianceReportPdfConfig
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 50, bottom: 60, left: 50, right: 50 },
        info: {
          Title: `Compliance Report - ${config.postTitle || "Content Review"}`,
          Author: "AGENCY Bristol",
          Subject: "Regulatory Compliance Review",
          Creator: "AGENCY Review Portal",
        },
        bufferPages: true,
      });

      const buffers: Uint8Array[] = [];
      doc.on("data", (chunk: Uint8Array) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      const pageWidth = doc.page.width - 100; // 50px margin each side
      const leftMargin = 50;
      let y = 50;

      // ── Helper functions ──────────────────────────────

      function sectionHeader(num: string, title: string) {
        checkPageBreak(50);
        y += 20;
        // Number badge
        doc
          .roundedRect(leftMargin, y, 28, 22, 4)
          .fill(COLORS.sectionNumber);
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor(COLORS.headerText)
          .text(num, leftMargin, y + 6, { width: 28, align: "center" });
        // Title
        doc
          .font("Helvetica-Bold")
          .fontSize(13)
          .fillColor(COLORS.sectionNumber)
          .text(title, leftMargin + 36, y + 4);
        y += 32;
        // Separator
        doc
          .moveTo(leftMargin, y)
          .lineTo(leftMargin + pageWidth, y)
          .strokeColor(COLORS.lightGray)
          .lineWidth(0.5)
          .stroke();
        y += 12;
      }

      function checkPageBreak(needed: number) {
        if (y + needed > doc.page.height - 80) {
          addFooter();
          doc.addPage();
          y = 50;
        }
      }

      function addFooter() {
        const footerY = doc.page.height - 45;
        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor(COLORS.mutedText)
          .text(
            `${config.companyName} | ${config.framework || "ABPI"} | Score: ${config.regulatoryScore}/100`,
            leftMargin,
            footerY,
            { width: pageWidth / 2, align: "left" }
          );
        doc
          .text(
            `Report ${config.reportId}`,
            leftMargin + pageWidth / 2,
            footerY,
            { width: pageWidth / 2, align: "right" }
          );
        doc
          .fontSize(6)
          .text(
            "This report is AI-generated and should be reviewed by qualified regulatory personnel before use.",
            leftMargin,
            footerY + 12,
            { width: pageWidth, align: "center" }
          );
      }

      // ══════════════════════════════════════════════════
      // PAGE 1: HEADER + SCORE
      // ══════════════════════════════════════════════════

      // Brand colour bar
      doc
        .rect(0, 0, doc.page.width, 6)
        .fill(config.brandColor || COLORS.accentViolet);
      y = 6;

      // Header block
      doc
        .rect(0, y, doc.page.width, 80)
        .fill(COLORS.headerBg);

      // Company name (left)
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(COLORS.headerText)
        .text(config.companyName.toUpperCase(), leftMargin, y + 15);

      // AGENCY branding (right)
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#94A3B8")
        .text("Powered by AGENCY", leftMargin + pageWidth - 100, y + 15, { width: 100, align: "right" });

      // Report title
      doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor(COLORS.headerText)
        .text("Regulatory Compliance Report", leftMargin, y + 40);

      y = 86 + 15;

      // ── Metadata grid ──────────────────────────────

      const metadataItems = [
        { label: "Content", value: config.postTitle || "Untitled" },
        { label: "Type", value: config.postType || "Social Post" },
        { label: "Framework", value: config.framework || "ABPI" },
        { label: "Spokesperson", value: config.spokespersonName || "N/A" },
        { label: "Date", value: config.scheduledDate || config.generatedAt },
        { label: "Status", value: config.regulatoryStatus === "approved" ? "Approved" : "Pending Review" },
      ];

      const metaColWidth = pageWidth / 3;
      for (let i = 0; i < metadataItems.length; i++) {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const mx = leftMargin + col * metaColWidth;
        const my = y + row * 28;

        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor(COLORS.mutedText)
          .text(metadataItems[i].label.toUpperCase(), mx, my);
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor(COLORS.bodyText)
          .text(metadataItems[i].value, mx, my + 10, { width: metaColWidth - 10 });
      }

      y += 60;

      // Separator
      doc
        .moveTo(leftMargin, y)
        .lineTo(leftMargin + pageWidth, y)
        .strokeColor(COLORS.lightGray)
        .lineWidth(0.5)
        .stroke();
      y += 5;

      // ── 01 COMPLIANCE SCORE ──────────────────────

      sectionHeader("01", "Compliance Score");

      const score = config.regulatoryScore;
      const scoreColor = getScoreColor(score);
      const scoreLabel = getScoreLabel(score);

      // Score circle (simplified — just a large number with label)
      const scoreX = leftMargin + 30;
      doc
        .roundedRect(leftMargin, y, 80, 80, 8)
        .fill(score >= 80 ? COLORS.passedBg : score >= 60 ? COLORS.regulatoryBg : COLORS.legalBg);
      doc
        .font("Helvetica-Bold")
        .fontSize(32)
        .fillColor(scoreColor)
        .text(String(score), scoreX - 15, y + 12, { width: 50, align: "center" });
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(COLORS.mutedText)
        .text("/100", scoreX - 15, y + 48, { width: 50, align: "center" });

      // Score details
      const detailX = leftMargin + 100;
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(scoreColor)
        .text(scoreLabel, detailX, y + 5);

      // Risk level badge
      const riskLevel = config.review.riskLevel || "low";
      const riskColors: Record<string, string> = {
        low: COLORS.scoreGreen,
        medium: COLORS.scoreAmber,
        high: COLORS.scoreOrange,
        critical: COLORS.scoreRed,
      };
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(riskColors[riskLevel] || COLORS.mutedText)
        .text(`${riskLevel.toUpperCase()} RISK`, detailX, y + 22);

      // Summary
      const summary = (config.review as RegulatoryReviewResult & { summary?: string })?.summary || "";
      if (summary) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(COLORS.bodyText)
          .text(summary, detailX, y + 40, { width: pageWidth - 120 });
      }

      // Markets
      if (config.review.targetCountries && config.review.targetCountries.length > 0) {
        y += 85;
        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor(COLORS.mutedText)
          .text(`Markets: ${config.review.targetCountries.join(", ")}`, leftMargin, y);
        y += 10;
      } else {
        y += 90;
      }

      // ── 02 CONTENT REVIEW ──────────────────────────

      sectionHeader("02", "Content Review");

      // Body text with simplified highlighting
      const issues = config.review.issues || [];
      const sentences = config.markdownBody
        .replace(/\*\*/g, "")
        .replace(/^#+\s+/gm, "")
        .split(/(?<=[.!?])\s+/);

      // Build issue sentence map
      const issueMap = new Map<string, RegulatoryIssueResult>();
      for (const issue of issues) {
        if (issue.sentence) {
          issueMap.set(issue.sentence.toLowerCase().trim(), issue);
        }
      }

      for (const sentence of sentences) {
        checkPageBreak(20);
        const normalized = sentence.toLowerCase().trim();
        let matchedIssue: RegulatoryIssueResult | undefined;

        for (const [issueSentence, issue] of issueMap.entries()) {
          if (normalized.includes(issueSentence) || issueSentence.includes(normalized)) {
            matchedIssue = issue;
            break;
          }
        }

        if (matchedIssue) {
          const cat = getComplianceCategory(matchedIssue.category);
          const bgColor = getCategoryBg(cat);
          const textHeight = doc.heightOfString(sentence, { width: pageWidth - 10 });
          doc
            .roundedRect(leftMargin, y - 2, pageWidth, textHeight + 6, 2)
            .fill(bgColor);
          doc
            .font("Helvetica")
            .fontSize(9)
            .fillColor(COLORS.bodyText)
            .text(sentence + " ", leftMargin + 5, y, { width: pageWidth - 10, continued: false });
          y += textHeight + 8;
        } else {
          doc
            .font("Helvetica")
            .fontSize(9)
            .fillColor(COLORS.bodyText)
            .text(sentence + " ", leftMargin, y, { width: pageWidth, continued: false });
          y += doc.heightOfString(sentence + " ", { width: pageWidth }) + 3;
        }
      }

      // Colour legend
      y += 10;
      checkPageBreak(25);
      const legendItems = [
        { label: "Clean", color: "#D1FAE5", border: "#A7F3D0" },
        { label: "Legal", color: COLORS.legalBg, border: COLORS.legalRed },
        { label: "Regulatory", color: COLORS.regulatoryBg, border: COLORS.regulatoryAmber },
        { label: "Compliance", color: COLORS.complianceBg, border: COLORS.complianceBlue },
      ];

      let legendX = leftMargin;
      for (const item of legendItems) {
        doc
          .roundedRect(legendX, y, 12, 10, 1)
          .fillAndStroke(item.color, item.border);
        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor(COLORS.mutedText)
          .text(item.label, legendX + 16, y + 1);
        legendX += 80;
      }
      y += 20;

      // ── 03 ISSUES FOUND ──────────────────────────────

      if (issues.length > 0) {
        sectionHeader("03", `Issues Found (${issues.length})`);

        for (let idx = 0; idx < issues.length; idx++) {
          const issue = issues[idx];
          const cat = getComplianceCategory(issue.category);
          const catColor = getCategoryColor(cat);
          const catLabel = getCategoryLabel(cat);
          const subcategoryLabel = CATEGORY_LABELS[issue.category] || issue.category;

          checkPageBreak(100);

          // Left colour stripe
          doc
            .rect(leftMargin, y, 3, 70)
            .fill(catColor);

          // Issue header
          const issueTitle = (issue as RegulatoryIssueResult & { title?: string }).title || issue.explanation?.slice(0, 60) || "Issue";
          doc
            .font("Helvetica-Bold")
            .fontSize(10)
            .fillColor(COLORS.sectionNumber)
            .text(issueTitle, leftMargin + 12, y + 2, { width: pageWidth - 20 });

          // Category + risk badges
          doc
            .font("Helvetica-Bold")
            .fontSize(7)
            .fillColor(catColor)
            .text(`${catLabel}: ${subcategoryLabel}`, leftMargin + 12, y + 18);

          const riskBadgeColors: Record<string, string> = {
            low: COLORS.scoreGreen,
            medium: COLORS.scoreAmber,
            high: COLORS.scoreOrange,
            critical: COLORS.scoreRed,
          };
          doc
            .font("Helvetica-Bold")
            .fontSize(7)
            .fillColor(riskBadgeColors[issue.riskLevel] || COLORS.mutedText)
            .text(
              `${(issue.riskLevel || "low").toUpperCase()} RISK`,
              leftMargin + 150,
              y + 18
            );

          let issueY = y + 34;

          // Flagged text
          if (issue.sentence) {
            doc
              .font("Helvetica")
              .fontSize(7)
              .fillColor(COLORS.mutedText)
              .text("FLAGGED TEXT", leftMargin + 12, issueY);
            issueY += 10;
            doc
              .font("Helvetica-Oblique")
              .fontSize(8)
              .fillColor(COLORS.bodyText)
              .text(`"${issue.sentence}"`, leftMargin + 12, issueY, { width: pageWidth - 24 });
            issueY += doc.heightOfString(`"${issue.sentence}"`, { width: pageWidth - 24 }) + 6;
          }

          // Explanation
          if (issue.explanation) {
            checkPageBreak(30);
            doc
              .font("Helvetica")
              .fontSize(7)
              .fillColor(COLORS.mutedText)
              .text("EXPLANATION", leftMargin + 12, issueY);
            issueY += 10;
            doc
              .font("Helvetica")
              .fontSize(8)
              .fillColor(COLORS.bodyText)
              .text(issue.explanation, leftMargin + 12, issueY, { width: pageWidth - 24 });
            issueY += doc.heightOfString(issue.explanation, { width: pageWidth - 24 }) + 6;
          }

          // Regulation reference
          if (issue.regulation) {
            checkPageBreak(20);
            doc
              .font("Helvetica")
              .fontSize(7)
              .fillColor(COLORS.mutedText)
              .text("REGULATION", leftMargin + 12, issueY);
            issueY += 10;
            doc
              .font("Helvetica-Bold")
              .fontSize(8)
              .fillColor(COLORS.bodyText)
              .text(issue.regulation, leftMargin + 12, issueY, { width: pageWidth - 24 });
            issueY += doc.heightOfString(issue.regulation, { width: pageWidth - 24 }) + 6;
          }

          // Suggested alternative
          if (issue.suggestion) {
            checkPageBreak(30);
            doc
              .font("Helvetica")
              .fontSize(7)
              .fillColor(COLORS.mutedText)
              .text("SUGGESTED ALTERNATIVE", leftMargin + 12, issueY);
            issueY += 10;
            const sugHeight = doc.heightOfString(issue.suggestion, { width: pageWidth - 34 });
            doc
              .roundedRect(leftMargin + 12, issueY - 3, pageWidth - 24, sugHeight + 8, 3)
              .fill(COLORS.passedBg);
            doc
              .font("Helvetica")
              .fontSize(8)
              .fillColor(COLORS.scoreGreen)
              .text(issue.suggestion, leftMargin + 17, issueY, { width: pageWidth - 34 });
            issueY += sugHeight + 12;
          }

          y = issueY + 10;

          // Separator between issues
          if (idx < issues.length - 1) {
            doc
              .moveTo(leftMargin + 12, y)
              .lineTo(leftMargin + pageWidth, y)
              .strokeColor(COLORS.lightGray)
              .lineWidth(0.3)
              .stroke();
            y += 8;
          }
        }
      }

      // ── 04 PASSED CHECKS ──────────────────────────────

      const passedChecks = config.review.passedChecks || [];
      if (passedChecks.length > 0) {
        sectionHeader("04", "Passed Checks");

        for (const check of passedChecks) {
          checkPageBreak(18);
          // Green checkmark
          doc
            .font("Helvetica")
            .fontSize(10)
            .fillColor(COLORS.greenCheck)
            .text("\u2713", leftMargin + 4, y);
          doc
            .font("Helvetica")
            .fontSize(9)
            .fillColor(COLORS.bodyText)
            .text(check, leftMargin + 20, y + 1, { width: pageWidth - 20 });
          y += 16;
        }
      }

      // ── 05 AUDIT TRAIL ──────────────────────────────

      sectionHeader("05", "Audit Trail");

      const trailItems = [
        { label: "Report Generated", value: config.generatedAt },
        { label: "Framework", value: config.framework || "ABPI" },
        { label: "Target Markets", value: config.review.targetCountries?.join(", ") || "GB" },
        { label: "Report ID", value: config.reportId },
        { label: "Status", value: config.regulatoryStatus === "approved" ? "Approved" : "Pending Review" },
      ];

      for (const item of trailItems) {
        checkPageBreak(18);
        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor(COLORS.mutedText)
          .text(item.label, leftMargin, y, { width: 120 });
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(COLORS.bodyText)
          .text(item.value, leftMargin + 120, y, { width: pageWidth - 120 });
        y += 16;
      }

      // ── FOOTER ──────────────────────────────────────

      addFooter();

      // Add footers to all buffered pages
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        // Page number at very bottom
        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor(COLORS.mutedText)
          .text(
            `Page ${i + 1} of ${totalPages}`,
            leftMargin,
            doc.page.height - 25,
            { width: pageWidth, align: "center" }
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
