/** Browser recording formats shared by dictation uploads and API transcription. */
export const RECORDING_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export function audioExtension(mimeType: string): string {
  switch (mimeType.split(";")[0].toLowerCase()) {
    case "audio/mp4": return "mp4";
    case "audio/mpeg": return "mp3";
    case "audio/wav":
    case "audio/x-wav": return "wav";
    case "audio/ogg": return "ogg";
    default: return "webm";
  }
}
