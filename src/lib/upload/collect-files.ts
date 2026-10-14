import { isJunkFile } from "./file-kind";

/**
 * Turn what was dropped or picked into a flat list of files.
 *
 * A dropped folder arrives as directory entries that must be walked; a
 * folder chosen with the directory picker already arrives as a flat list.
 * Hidden and system files are skipped either way.
 */

interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (ok: (f: File) => void, bad: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (e: FsEntry[]) => void, bad: (e: unknown) => void) => void };
}

async function readAll(reader: ReturnType<NonNullable<FsEntry["createReader"]>>): Promise<FsEntry[]> {
  const out: FsEntry[] = [];
  // readEntries returns at most about 100 entries a call; loop until empty.
  for (;;) {
    const batch = await new Promise<FsEntry[]>((ok, bad) => reader.readEntries(ok, bad));
    if (batch.length === 0) return out;
    out.push(...batch);
  }
}

async function walk(entry: FsEntry, out: File[]): Promise<void> {
  if (isJunkFile(entry.name)) return;
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((ok, bad) => entry.file!(ok, bad));
    out.push(file);
  } else if (entry.isDirectory && entry.createReader) {
    for (const child of await readAll(entry.createReader())) await walk(child, out);
  }
}

export async function collectFromDrop(dt: DataTransfer): Promise<File[]> {
  const out: File[] = [];
  const entries: FsEntry[] = [];
  for (const item of Array.from(dt.items || [])) {
    const entry = (item as unknown as { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  if (entries.length > 0) {
    for (const e of entries) await walk(e, out);
  } else {
    out.push(...Array.from(dt.files || []).filter((f) => !isJunkFile(f.name)));
  }
  return sortByName(out);
}

export function collectFromInput(list: FileList | null): File[] {
  if (!list) return [];
  return sortByName(Array.from(list).filter((f) => !isJunkFile(f.name)));
}

function sortByName(files: File[]): File[] {
  return files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
