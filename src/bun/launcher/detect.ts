import { openSync, readSync, closeSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";

/** What kind of program to look for in a game's folder. */
export type Target = "windows-exe" | "linux-native" | "mac-app";

// Helpers that ship next to games but never are the game.
const NOT_THE_GAME =
	/unins|setup|install|redist|vcredist|vc_redist|dxsetup|dxwebsetup|directx|dotnet|crash|report|helper|updater|cleanup|activation|touchup|oalinst|physx/i;

const MAX_DEPTH = 4;

interface Candidate {
	path: string;
	depth: number;
	size: number;
}

function isElf(path: string): boolean {
	try {
		const fd = openSync(path, "r");
		const magic = Buffer.alloc(4);
		readSync(fd, magic, 0, 4, 0);
		closeSync(fd);
		return magic.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
	} catch {
		return false;
	}
}

async function walk(
	dir: string,
	depth: number,
	target: Target,
	ignored: Set<string>,
	found: Candidate[],
) {
	for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
		const path = join(dir, entry.name);
		const ext = extname(entry.name).toLowerCase();
		const stem = basename(entry.name, extname(entry.name)).toLowerCase();

		if (entry.isDirectory()) {
			if (target === "mac-app" && ext === ".app") {
				// An app bundle is the program; never look inside it.
				found.push({ path, depth, size: 0 });
			} else if (depth < MAX_DEPTH && !entry.name.startsWith(".")) {
				await walk(path, depth + 1, target, ignored, found);
			}
			continue;
		}
		if (!entry.isFile() || ignored.has(stem) || NOT_THE_GAME.test(stem)) continue;

		const info = await stat(path);
		const executableBit = (info.mode & 0o111) !== 0;
		const matches =
			target === "windows-exe"
				? ext === ".exe"
				: target === "linux-native" &&
					(ext === ".sh" ||
						ext === ".appimage" ||
						ext === ".x86_64" ||
						(ext === "" && executableBit && isElf(path)));
		if (matches) found.push({ path, depth, size: info.size });
	}
}

/**
 * Programs in `root` that could start the game, best guess first
 * (closest to the top, then largest). Paths are relative to `root`.
 */
export async function findExecutables(
	root: string,
	target: Target,
	ignoredNames: string[] = [],
): Promise<string[]> {
	const found: Candidate[] = [];
	const ignored = new Set(ignoredNames.map((n) => n.toLowerCase()));
	await walk(root, 0, target, ignored, found);
	return found
		.sort((a, b) => a.depth - b.depth || b.size - a.size || a.path.localeCompare(b.path))
		.map((c) => relative(root, c.path));
}

// What Wine itself puts on a new C: drive.
const WINE_OWN =
	/^(windows|Program Files( \(x86\))?[\\/](Common Files|Internet Explorer|Windows Media Player|Windows NT))[\\/]/i;

/**
 * Programs an installer added to the C: drive of a Wine prefix, best guess
 * first. Paths are relative to `driveC`. Empty when the prefix doesn't exist.
 */
export async function findInPrefix(driveC: string, ignoredNames: string[] = []): Promise<string[]> {
	return (await findExecutables(driveC, "windows-exe", ignoredNames)).filter((path) => !WINE_OWN.test(path));
}

/**
 * The one obvious choice, or null when the user has to decide:
 * a single candidate, or a single candidate at the shallowest level.
 */
export function obviousChoice(candidates: string[]): string | null {
	if (candidates.length === 0) return null;
	if (candidates.length === 1) return candidates[0];
	const depth = (p: string) => p.split(/[\\/]/).length;
	const top = candidates.filter((c) => depth(c) === depth(candidates[0]));
	return top.length === 1 ? top[0] : null;
}
