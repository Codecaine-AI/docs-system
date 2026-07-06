import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Writes `content` to `absPath` via write-temp-then-rename so a crash mid-write
 * never leaves a truncated file at `absPath`. The temp file lives in the same
 * directory as `absPath` (so the rename is same-filesystem, hence atomic on
 * POSIX). Ensures the parent directory exists first. */
export async function atomicWriteFile(absPath: string, content: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });

  const tempPath = `${absPath}.tmp-${randomUUID()}`;

  try {
    await writeFile(tempPath, content, "utf8");
    await rename(tempPath, absPath);
  } catch (error) {
    try {
      await unlink(tempPath);
    } catch {
      // best-effort cleanup; ignore failures
    }
    throw error;
  }
}
