/**
 * An uploaded PDF as a LinkedIn document post (28 Nov 2026).
 *
 * LinkedIn's Documents API takes a PDF (also PPT, DOC and their x forms) up
 * to 100 MB and 300 pages. Only PDF is accepted here: that is what the
 * portal stores for a piece. The check runs on the downloaded bytes, so a
 * file renamed to .pdf or served with the wrong type is refused before any
 * upload starts.
 */

export const LINKEDIN_DOCUMENT_MAX_BYTES = 100 * 1024 * 1024;
export const LINKEDIN_DOCUMENT_MAX_PAGES = 300;

/** Page objects in the file. Counts "/Type /Page" and not "/Type /Pages". */
export function countPdfPages(bytes: Buffer): number {
  const text = bytes.toString("latin1");
  return (text.match(/\/Type\s*\/Page(?![A-Za-z])/g) || []).length;
}

/** A refusal message safe to show on the job, or null when LinkedIn will take the file. */
export function validateLinkedInPdf(bytes: Buffer, contentType: string | null | undefined): string | null {
  const type = (contentType || "").split(";")[0].trim().toLowerCase();
  if (type && type !== "application/pdf" && type !== "application/octet-stream") {
    return "LinkedIn document posts need a PDF. This file is not one.";
  }
  if (bytes.length === 0) return "The PDF is empty.";
  if (bytes.length > LINKEDIN_DOCUMENT_MAX_BYTES) return "The PDF is over LinkedIn's 100 MB limit.";
  if (bytes.subarray(0, 1024).indexOf("%PDF-") === -1) return "LinkedIn document posts need a PDF. This file is not one.";
  if (countPdfPages(bytes) > LINKEDIN_DOCUMENT_MAX_PAGES) return "The PDF has more than LinkedIn's 300 page limit.";
  return null;
}
