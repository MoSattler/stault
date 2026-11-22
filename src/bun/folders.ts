import { rm, statfs } from "node:fs/promises";
import { dirname } from "node:path";
import type { LibraryFolder } from "../shared/model";

/** Free space on the volume holding `path`, which may not exist yet. */
export async function freeBytes(path: string): Promise<number | null> {
	for (let dir = path; ; dir = dirname(dir)) {
		try {
			const stats = await statfs(dir);
			return stats.bavail * stats.bsize;
		} catch {
			if (dirname(dir) === dir) return null;
		}
	}
}

export function describeFolders(paths: string[]): Promise<LibraryFolder[]> {
	return Promise.all(
		paths.map(async (path) => ({ path, freeBytes: await freeBytes(path) })),
	);
}

/**
 * Deletes a folder and everything in it. Windows keeps a program's files
 * locked for a moment after it exits, so a refusal is retried for a few seconds.
 */
export async function removeFolder(path: string): Promise<void> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await rm(path, { recursive: true, force: true });
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (attempt === 20 || (code !== "EPERM" && code !== "EBUSY" && code !== "ENOTEMPTY")) throw error;
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
	}
}
