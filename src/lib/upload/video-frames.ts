/**
 * Three still frames (start, middle, end) from a video, taken in the browser.
 *
 * The server cannot do this: a clip can be 2 GB and never passes through a
 * server function. The frames are small JPEGs sent with the register call;
 * the middle one becomes the poster and all three go to the tagger.
 *
 * If the browser cannot decode the file (for example an HEVC .mov in a
 * browser without HEVC support) this returns no frames and the clip is added
 * without a poster or automatic tags, which a person can add by hand.
 */

export function frameTimes(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  const start = Math.min(0.3, duration * 0.05);
  const end = Math.max(duration - 0.3, duration * 0.95);
  return [start, duration / 2, end];
}

export interface VideoInfo {
  frames: string[];
  width: number | null;
  height: number | null;
  duration: number | null;
}

const MAX_EDGE = 640;

export async function extractVideoFrames(file: File): Promise<VideoInfo> {
  const empty: VideoInfo = { frames: [], width: null, height: null, duration: null };
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  const once = (type: string, ms: number) =>
    new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);
      video.addEventListener(
        type,
        () => {
          clearTimeout(timer);
          resolve(true);
        },
        { once: true }
      );
      video.addEventListener("error", () => { clearTimeout(timer); resolve(false); }, { once: true });
    });

  try {
    const loaded = once("loadeddata", 20000);
    video.src = url;
    if (!(await loaded) || !video.videoWidth) return empty;

    const duration = Number.isFinite(video.duration) ? video.duration : null;
    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ...empty, width: video.videoWidth, height: video.videoHeight, duration };

    const frames: string[] = [];
    for (const t of frameTimes(duration ?? 0)) {
      const seeked = once("seeked", 10000);
      video.currentTime = t;
      if (!(await seeked)) continue;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.7));
    }
    return { frames, width: video.videoWidth, height: video.videoHeight, duration };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
