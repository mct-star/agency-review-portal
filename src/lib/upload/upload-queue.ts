/**
 * The queue behind the bulk uploader.
 *
 * Pure state and scheduling, no network and no DOM, so it can be tested.
 * Photos upload three at a time and videos one at a time, in separate lanes
 * so one slow 2 GB clip does not hold up two hundred photos. Every file ends
 * as done, already in the library, or failed; a failed file can be retried on
 * its own and the rest carry on.
 */

export type Lane = "photo" | "video";

export type ItemStatus =
  | "queued"
  | "preparing" // reading, converting, fingerprinting
  | "uploading"
  | "saving" // register: thumbnail and record
  | "done"
  | "exists" // already in the library
  | "error";

export interface QueueItem {
  id: string;
  name: string;
  size: number;
  lane: Lane;
  status: ItemStatus;
  progress: number; // 0 to 1 while uploading
  message?: string; // a short note while working, e.g. "Converting"
  error?: string;
  attempts: number;
}

export type Runner<F> = (
  file: F,
  item: QueueItem,
  update: (patch: Partial<QueueItem>) => void
) => Promise<"done" | "exists">;

const LIMITS: Record<Lane, number> = { photo: 3, video: 1 };

export function isFinished(s: ItemStatus): boolean {
  return s === "done" || s === "exists" || s === "error";
}

export class UploadQueue<F> {
  private items: QueueItem[] = [];
  private files = new Map<string, F>();
  private listeners = new Set<(items: QueueItem[]) => void>();
  private running: Record<Lane, number> = { photo: 0, video: 0 };
  private seq = 0;

  constructor(
    private run: Runner<F>,
    private laneOf: (file: F) => Lane,
    private describe: (file: F) => { name: string; size: number }
  ) {}

  subscribe(fn: (items: QueueItem[]) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  snapshot(): QueueItem[] {
    return this.items.map((i) => ({ ...i }));
  }

  add(files: F[]): void {
    for (const file of files) {
      const { name, size } = this.describe(file);
      const id = `${Date.now().toString(36)}-${(this.seq += 1)}`;
      this.files.set(id, file);
      this.items.push({ id, name, size, lane: this.laneOf(file), status: "queued", progress: 0, attempts: 0 });
    }
    this.emit();
    this.pump();
  }

  retry(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (!item || item.status !== "error") return;
    Object.assign(item, { status: "queued", progress: 0, error: undefined, message: undefined });
    this.emit();
    this.pump();
  }

  retryAllFailed(): void {
    for (const item of this.items) {
      if (item.status === "error") {
        Object.assign(item, { status: "queued", progress: 0, error: undefined, message: undefined });
      }
    }
    this.emit();
    this.pump();
  }

  /** Forget finished files (their data is released); keeps anything still running or failed. */
  clearFinished(): void {
    const keep = this.items.filter((i) => !(i.status === "done" || i.status === "exists"));
    for (const i of this.items) if (!keep.includes(i)) this.files.delete(i.id);
    this.items = keep;
    this.emit();
  }

  counts() {
    const c = { total: this.items.length, done: 0, exists: 0, error: 0, active: 0 };
    for (const i of this.items) {
      if (i.status === "done") c.done += 1;
      else if (i.status === "exists") c.exists += 1;
      else if (i.status === "error") c.error += 1;
      else c.active += 1;
    }
    return c;
  }

  private emit() {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }

  private pump() {
    for (const lane of ["photo", "video"] as Lane[]) {
      while (this.running[lane] < LIMITS[lane]) {
        const next = this.items.find((i) => i.lane === lane && i.status === "queued");
        if (!next) break;
        void this.start(next);
      }
    }
  }

  private async start(item: QueueItem) {
    this.running[item.lane] += 1;
    item.status = "preparing";
    item.attempts += 1;
    this.emit();
    const file = this.files.get(item.id) as F;
    const update = (patch: Partial<QueueItem>) => {
      Object.assign(item, patch);
      this.emit();
    };
    try {
      const outcome = await this.run(file, item, update);
      item.status = outcome;
      item.progress = 1;
      item.message = undefined;
    } catch (err) {
      item.status = "error";
      item.error = err instanceof Error ? err.message : "Upload failed";
      item.message = undefined;
    } finally {
      this.running[item.lane] -= 1;
      this.emit();
      this.pump();
    }
  }
}
