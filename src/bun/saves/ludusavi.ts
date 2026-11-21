import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The official GameVault client rewrites save paths to these, so a save made on
// one device restores on another. Using the same names keeps both clients'
// saves interchangeable.
const INSTALL_DIR = "G:\\gamevault\\installation";
const USER_DIR = "G:\\gamevault\\currentuser";

/** Where one installed game and its saves live on this device. */
export interface GameLocation {
	/** The game's folder in a library folder: "<Title> [<id>]". */
	gameDir: string;
	/** The game's own files inside it. */
	filesDir: string;
	/** The user folder saves live under: the home folder, or the one inside a Wine prefix. */
	userDir: string;
	/** Wine prefix to search as well (a Windows game on Linux). */
	winePrefix?: string;
}

/** What a look at the saves on this device found. */
export interface Scan {
	/** There are saves. */
	found: boolean;
	/** They differ from the backup they were compared with. */
	changed: boolean;
	/** The save files, by their path on this device. */
	files: string[];
}

/** Root paths are globs: a literal "[" is written "[[]". Stault's game folders end in "[<id>]". */
export const globEscape = (path: string) => path.replace(/\[/g, "[[]");

/**
 * Ludusavi's settings for working on one game. Written as JSON, which is YAML.
 * `name` is Ludusavi's name for the game, once known.
 */
export function ludusaviConfig(where: GameLocation, name: string | null) {
	return {
		release: { check: false },
		// Ludusavi expects each child of a root to be a game named after itself.
		// Stault's layout has one child, "files", which the entry below names.
		roots: [{ store: "other", path: globEscape(where.gameDir) }],
		customGames: name ? [{ name, integration: "extend", installDir: ["files"] }] : [],
		// Applied in order. The install folder goes first: it often sits inside the user folder.
		redirects: [
			{ kind: "bidirectional", source: where.filesDir, target: INSTALL_DIR },
			{ kind: "bidirectional", source: where.userDir, target: USER_DIR },
		],
		// One full copy per game, so the backup folder holds exactly the latest state.
		backup: { retention: { full: 1, differential: 0 }, format: { chosen: "zip" } },
	};
}

interface Output {
	errors?: { someGamesFailed?: boolean; unknownGames?: string[] };
	games?: Record<
		string,
		{ score?: number; change?: string; files?: Record<string, { ignored?: boolean }>; registry?: Record<string, unknown> }
	>;
}

/** Reads a backup or preview result for one game. */
export function readScan(output: Output, name: string): Scan {
	const game = output.games?.[name];
	const files = Object.entries(game?.files ?? {})
		.filter(([, file]) => !file.ignored)
		.map(([path]) => path);
	const items = files.length + Object.keys(game?.registry ?? {}).length;
	return { found: items > 0, changed: items > 0 && game?.change !== "Same", files };
}

/** Runs the bundled Ludusavi, which knows where games keep their saves. */
export class Ludusavi {
	constructor(
		private readonly binary: string,
		/** Stault's own Ludusavi folder: settings and the downloaded game list. */
		private readonly configDir: string,
		private readonly home: string,
	) {}

	get available(): boolean {
		return existsSync(this.binary);
	}

	private async run(where: GameLocation, name: string | null, args: string[]): Promise<Output> {
		mkdirSync(this.configDir, { recursive: true });
		writeFileSync(join(this.configDir, "config.yaml"), JSON.stringify(ludusaviConfig(where, name)));
		if (process.platform !== "win32") {
			try {
				chmodSync(this.binary, 0o755);
			} catch {
				// Read-only bundle: the file already carries its mode.
			}
		}
		const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
			// --try-manifest-update: an unreachable game list must not fail the run.
			const child = spawn(this.binary, ["--config", this.configDir, "--try-manifest-update", ...args], {
				env: { ...process.env, HOME: this.home },
				// With nothing on stdin, Ludusavi would wait there for game names.
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
			});
			let stdout = "";
			let stderr = "";
			child.stdout.on("data", (chunk: Buffer) => {
				stdout += chunk.toString();
			});
			child.stderr.on("data", (chunk: Buffer) => {
				stderr += chunk.toString();
			});
			child.on("error", reject);
			child.on("close", () => resolve({ stdout, stderr }));
		});
		// The game list is downloaded on first use; without it nothing is known.
		if (!existsSync(join(this.configDir, "manifest.yaml"))) {
			throw new Error("Ludusavi couldn't download its list of games. Save sync needs the internet once.");
		}
		try {
			return JSON.parse(stdout) as Output;
		} catch {
			throw new Error(`Ludusavi failed: ${stderr.trim().split("\n").at(-1) || "no output"}`);
		}
	}

	/** Ludusavi's entry for a title, with how well it matches (0 to 1), or null. */
	async find(where: GameLocation, title: string): Promise<{ name: string; score: number } | null> {
		const output = await this.run(where, null, ["find", "--api", "--normalized", title]);
		const [hit] = Object.entries(output.games ?? {});
		return hit ? { name: hit[0], score: hit[1].score ?? 0 } : null;
	}

	/** Entries resembling a query, best first, for choosing one by hand. */
	async search(where: GameLocation, query: string): Promise<string[]> {
		const output = await this.run(where, null, ["find", "--api", "--multiple", "--fuzzy", query]);
		return Object.entries(output.games ?? {})
			.sort(([, a], [, b]) => (b.score ?? 0) - (a.score ?? 0))
			.slice(0, 8)
			.map(([name]) => name);
	}

	private backupArgs(where: GameLocation, name: string, folder: string, preview: boolean) {
		return [
			"backup",
			preview ? "--preview" : "--force",
			"--api",
			"--path",
			folder,
			...(where.winePrefix ? ["--wine-prefix", where.winePrefix] : []),
			name,
		];
	}

	/** Compares the saves on this device with the backup in `folder`, changing nothing. */
	async scan(where: GameLocation, name: string, folder: string): Promise<Scan> {
		return readScan(await this.run(where, name, this.backupArgs(where, name, folder, true)), name);
	}

	/** Copies the saves on this device into `folder`, replacing an earlier backup there. */
	async backup(where: GameLocation, name: string, folder: string): Promise<Scan> {
		const output = await this.run(where, name, this.backupArgs(where, name, folder, false));
		if (output.errors?.someGamesFailed) throw new Error("Some save files could not be read.");
		return readScan(output, name);
	}

	/** Puts the backup in `folder` in place of the saves on this device. */
	async restore(where: GameLocation, name: string, folder: string): Promise<void> {
		const output = await this.run(where, name, ["restore", "--force", "--api", "--path", folder, name]);
		if (!output.games?.[name]) throw new Error("That save belongs to a different game.");
		if (output.errors?.someGamesFailed) throw new Error("Some save files could not be written.");
	}
}
