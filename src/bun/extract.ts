import { spawn } from "node:child_process";
import { chmodSync } from "node:fs";

/**
 * Extracts an archive with the bundled 7-Zip, reporting progress from 0 to 1.
 * Handles every format the GameVault server indexes (zip, 7z, rar, iso, tar…).
 */
export function extract(
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
	return new Promise((resolve, reject) => {
		// x: keep paths, -y: answer yes, -bsp1: progress to stdout, -bso0: no file list,
		// -p: an empty password, so a protected archive fails instead of prompting.
		const child = spawn(
			sevenZip,
			["x", archive, `-o${destination}`, "-y", "-bsp1", "-bso0", "-p"],
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
