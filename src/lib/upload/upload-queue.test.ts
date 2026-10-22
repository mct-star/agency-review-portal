import { describe, expect, it } from "vitest";
import { UploadQueue, type Runner } from "./upload-queue";

interface F { name: string; size: number; lane: "photo" | "video" }
const file = (name: string, lane: "photo" | "video" = "photo"): F => ({ name, size: 1, lane });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

function make(run: Runner<F>) {
  return new UploadQueue<F>(run, (f) => f.lane, (f) => ({ name: f.name, size: f.size }));
}

describe("UploadQueue", () => {
  it("uploads three photos at once and queues the rest", async () => {
    const gates = Array.from({ length: 5 }, () => deferred());
    let started = 0;
    const q = make(async (f) => {
      const i = started++;
      await gates[i].promise;
      return "done";
    });
    q.add(Array.from({ length: 5 }, (_, i) => file(`p${i}.jpg`)));
    await tick();
    expect(started).toBe(3);
    expect(q.counts().active).toBe(5);
    gates[0].resolve();
    await tick();
    expect(started).toBe(4);
    gates.forEach((g) => g.resolve());
    await tick();
    expect(q.counts()).toMatchObject({ done: 5, error: 0, active: 0 });
  });

  it("runs videos one at a time without blocking photos", async () => {
    const videoGate = deferred();
    const ran: string[] = [];
    const q = make(async (f) => {
      ran.push(f.name);
      if (f.lane === "video") await videoGate.promise;
      return "done";
    });
    q.add([file("a.mp4", "video"), file("b.mp4", "video"), file("p.jpg")]);
    await tick();
    expect([...ran].sort()).toEqual(["a.mp4", "p.jpg"]);
    videoGate.resolve();
    await tick();
    expect([...ran].sort()).toEqual(["a.mp4", "b.mp4", "p.jpg"]);
  });

  it("reports a file already in the library as exists, not as a failure", async () => {
    const q = make(async () => "exists");
    q.add([file("dup.jpg")]);
    await tick();
    expect(q.counts()).toMatchObject({ exists: 1, error: 0 });
  });

  it("carries on after a failure and retries just that file", async () => {
    let attempts = 0;
    const q = make(async (f) => {
      if (f.name === "bad.jpg" && ++attempts === 1) throw new Error("Network error during upload");
      return "done";
    });
    q.add([file("bad.jpg"), file("good.jpg")]);
    await tick();
    expect(q.counts()).toMatchObject({ done: 1, error: 1 });
    expect(q.snapshot().find((i) => i.name === "bad.jpg")?.error).toBe("Network error during upload");
    q.retry(q.snapshot().find((i) => i.name === "bad.jpg")!.id);
    await tick();
    expect(q.counts()).toMatchObject({ done: 2, error: 0 });
  });

  it("clears finished files but keeps failures visible", async () => {
    const q = make(async (f) => {
      if (f.name === "bad.jpg") throw new Error("nope");
      return "done";
    });
    q.add([file("ok.jpg"), file("bad.jpg")]);
    await tick();
    q.clearFinished();
    expect(q.snapshot().map((i) => i.name)).toEqual(["bad.jpg"]);
  });

  it("lets the runner report progress", async () => {
    const gate = deferred();
    const q = make(async (_f, _i, update) => {
      update({ status: "uploading", progress: 0.4 });
      await gate.promise;
      return "done";
    });
    q.add([file("p.jpg")]);
    await tick();
    expect(q.snapshot()[0]).toMatchObject({ status: "uploading", progress: 0.4 });
    gate.resolve();
  });
});
