import { spawn } from "node:child_process";
import { chmodSync } from "node:fs";
import { lstat, readdir, readlink, realpath, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * Extracts an archive with the bundled 7-Zip, reporting progress from 0 to 1.
 * Handles every format the GameVault server indexes (zip, 7z, rar, iso, tar…).
 * An archive with a link that leads out of `destination` is refused, and a
 * failed extraction leaves nothing behind.
 */
export async function extract(
	sevenZip: string,
	archive: string,
	destination: string,
	onProgress: (fraction: number) => void,
	signal?: AbortSignal,
): Promise<void> {
	if (process.platform !== "win32") {
		try {
			chmodSync(sevenZip, 0o755);
		} catch {
			// Read-only bundle: the file already carries its mode.
		}
	}
	try {
		await run(sevenZip, archive, destination, onProgress, signal);
		const stray = await findLinkOut(destination);
		if (stray) {
			throw new Error(
				`This archive was not installed: "${stray}" is a link to somewhere outside the game's folder.`,
			);
		}
	} catch (error) {
		await rm(destination, { recursive: true, force: true });
		throw error;
	}
}

function run(
	sevenZip: string,
	archive: string,
	destination: string,
	onProgress: (fraction: number) => void,
	signal?: AbortSignal,
): Promise<void> {
	return new Promise((resolve, reject) => {
		// x: keep paths, -y: answer yes, -bsp1: progress to stdout, -bso0: no file list,
		// -p: an empty password, so a protected archive fails instead of prompting.
		// -snld20: create every link. 7-Zip's own check also refuses a link that passes
		// through another link, which every macOS framework has; findLinkOut replaces it.
		const child = spawn(
			sevenZip,
			["x", archive, `-o${destination}`, "-y", "-bsp1", "-bso0", "-p", "-snld20"],
			{ stdio: ["ignore", "pipe", "pipe"], signal },
		);
		let errors = "";
		child.stdout.on("data", (chunk: Buffer) => {
			const percents = chunk.toString().match(/(\d{1,3})%/g);
			if (percents) onProgress(Math.min(1, Number.parseInt(percents.at(-1)!, 10) / 100));
		});
		child.stderr.on("data", (chunk: Buffer) => {
			errors += chunk.toString();
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) return resolve();
			if (/password/i.test(errors)) {
				return reject(new Error("This archive is password-protected, which Stault can't open yet."));
			}
			const detail = errors.trim().split("\n").filter(Boolean).at(-1);
			reject(new Error(`The archive could not be extracted${detail ? `: ${detail}` : "."}`));
		});
	});
}

/** The first symbolic or hard link under `folder` that leads out of it, as a path within it. */
async function findLinkOut(folder: string): Promise<string | null> {
	const root = await realpath(folder).catch(() => null);
	if (!root) return null; // An empty archive extracts to nothing.
	// Files with several names, and how many of those names are not under root.
	const shared = new Map<string, { path: string; namesElsewhere: bigint }>();
	const folders = [root];
	for (let dir = folders.pop(); dir; dir = folders.pop()) {
		for (const entry of await readdir(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) folders.push(path);
			else if (entry.isSymbolicLink()) {
				if (!(await staysInside(path, root))) return relative(root, path);
			} else if (entry.isFile()) {
				const { nlink, dev, ino } = await lstat(path, { bigint: true });
				if (nlink < 2n) continue;
				const file = shared.get(`${dev}:${ino}`) ?? { path, namesElsewhere: nlink };
				file.namesElsewhere--;
				shared.set(`${dev}:${ino}`, file);
			}
		}
	}
	for (const file of shared.values()) if (file.namesElsewhere > 0n) return relative(root, file.path);
	return null;
}

/** Whether a symbolic link, followed all the way, ends under `root` (a real path). */
async function staysInside(link: string, root: string): Promise<boolean> {
	const inside = (path: string) => path === root || path.startsWith(root + sep);
	try {
		return inside(await realpath(link));
	} catch (error) {
		// A loop, or anything else that cannot be followed, is not worth keeping.
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false;
	}
	// A dangling link (frameworks often ship some) has nothing to follow, so it is judged
	// as written: it may climb first, then descend. A ".." after a name is refused,
	// because that name could be a link and the ".." would then climb from its target.
	const target = await readlink(link);
	const parts = target.split(/[\\/]+/);
	const firstName = parts.findIndex((part) => part !== "" && part !== "." && part !== "..");
	const climbsAfterName = firstName !== -1 && parts.includes("..", firstName);
	return !isAbsolute(target) && !climbsAfterName && inside(resolve(dirname(link), target));
}

/** Packs a folder's contents into a zip with the bundled 7-Zip. */
export function zipFolder(sevenZip: string, folder: string, zipPath: string): Promise<void> {
	return new Promise((done, fail) => {
		const child = spawn(sevenZip, ["a", "-tzip", "-bso0", "-bsp0", zipPath, "."], {
			cwd: folder,
			stdio: ["ignore", "ignore", "pipe"],
		});
		let errors = "";
		child.stderr.on("data", (chunk: Buffer) => {
			errors += chunk.toString();
		});
		child.on("error", fail);
		child.on("close", (code) =>
			code === 0 ? done() : fail(new Error(`The saves could not be packed: ${errors.trim()}`)),
		);
	});
}
