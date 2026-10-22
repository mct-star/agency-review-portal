"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classifyFile } from "./file-kind";
import { createLibraryRunner, type RunnerConfig } from "./library-runner";
import { UploadQueue, type QueueItem } from "./upload-queue";

/**
 * React wrapper for the bulk uploader: a queue of files with a per-file
 * progress list, retry, and a callback each time a file lands.
 */
export function useBulkUpload(config: RunnerConfig, onLanded?: () => void) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const landed = useRef(onLanded);
  landed.current = onLanded;

  const configKey = JSON.stringify(config);
  const queue = useMemo(() => {
    const runner = createLibraryRunner(config);
    return new UploadQueue<File>(
      async (file, item, update) => {
        const outcome = await runner(file, item, update);
        landed.current?.();
        return outcome;
      },
      (file) => (classifyFile(file) === "video" ? "video" : "photo"),
      (file) => ({ name: file.name, size: file.size })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey]);

  useEffect(() => queue.subscribe(setItems), [queue]);

  const addFiles = useCallback((files: File[]) => queue.add(files), [queue]);
  const retry = useCallback((id: string) => queue.retry(id), [queue]);
  const retryAll = useCallback(() => queue.retryAllFailed(), [queue]);
  const clearFinished = useCallback(() => queue.clearFinished(), [queue]);

  const summary = useMemo(() => {
    const s = { total: items.length, done: 0, exists: 0, error: 0, active: 0 };
    for (const i of items) {
      if (i.status === "done") s.done += 1;
      else if (i.status === "exists") s.exists += 1;
      else if (i.status === "error") s.error += 1;
      else s.active += 1;
    }
    return s;
  }, [items]);

  return { items, summary, addFiles, retry, retryAll, clearFinished };
}
