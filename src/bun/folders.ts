import { statfs } from "node:fs/promises";
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
