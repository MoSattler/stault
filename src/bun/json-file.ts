import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Reads a JSON file, or returns the fallback when it is missing or unreadable. */
export function readJson<T>(path: string, fallback: T): T {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		return fallback;
	}
}

/** Writes JSON through a temp file, so a crash never leaves half a file. */
export function writeJson(path: string, value: unknown, mode = 0o644) {
	mkdirSync(dirname(path), { recursive: true });
	const temp = `${path}.tmp`;
	writeFileSync(temp, JSON.stringify(value, null, "\t"), { mode });
	renameSync(temp, path);
}
