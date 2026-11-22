import { existsSync, readdirSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { GameType, Install } from "../shared/model";
import { removeFolder } from "./folders";
import { readJson, writeJson } from "./json-file";

/** Written into every installed game's folder. The folders are the database. */
export interface Manifest {
	serverUrl: string;
	gameId: number;
	versionId: number;
	version: string | null;
	type: GameType;
	title: string;
	installedAt: string;
	sizeBytes: number;
	/** The program that starts the game: relative to files/, or absolute. */
	executable?: string;
	/** Minutes played that the server has not been told about yet. */
	pendingMinutes?: number;
	/** Save sync bookkeeping. Absent until Stault has looked the game up. */
	saves?: SaveRecord;
}

export interface SaveRecord {
	/** Tells the server which install a save came from (UUID v4). */
	installationId: string;
	/** Ludusavi's name for this game. Null: it knows none, or the user turned sync off. */
	name: string | null;
	/**
	 * Save files the user named by hand, as Ludusavi paths. When set, `name` is
	 * the game's title and these take the place of Ludusavi's own entry.
	 */
	paths?: string[];
	/** Upload time of the server save this install last restored or uploaded. */
	syncedAt?: number;
	/** Upload time of a server save made for another operating system, to leave alone. */
	foreignAt?: number;
	/** The saves here still have to reach the server. */
	pending?: boolean;
}

const META = ".stault";

/** A folder name that is valid on Windows, macOS and Linux. */
export function safeName(title: string): string {
	const cleaned = title
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[. ]+$/, "")
		.slice(0, 80)
		.trim();
	return cleaned || "Game";
}

/**
 * Layout of one game inside a library folder:
 *   <folder>/<Title> [<id>]/.stault/manifest.json
 *   <folder>/<Title> [<id>]/.stault/download/   (only while installing)
 *   <folder>/<Title> [<id>]/files/              (the game)
 */
export function gameDir(folder: string, title: string, gameId: number): string {
	return join(folder, `${safeName(title)} [${gameId}]`);
}
export const filesDir = (dir: string) => join(dir, "files");
export const workDir = (dir: string) => join(dir, META);
const manifestPath = (dir: string) => join(dir, META, "manifest.json");

export async function folderSize(path: string): Promise<number> {
	let total = 0;
	for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) {
		const child = join(path, entry.name);
		if (entry.isDirectory()) total += await folderSize(child);
		else if (entry.isFile()) total += (await stat(child)).size;
	}
	return total;
}

export class Installs {
	private byGame = new Map<number, { dir: string; manifest: Manifest }>();

	constructor(private readonly onChange: (installs: Install[]) => void) {}

	/** Finds every game installed from this server in the library folders. */
	scan(folders: string[], serverUrl: string | null) {
		this.byGame.clear();
		for (const folder of serverUrl ? folders : []) {
			if (!existsSync(folder)) continue;
			for (const entry of readdirSync(folder, { withFileTypes: true })) {
				if (!entry.isDirectory()) continue;
				const dir = join(folder, entry.name);
				const manifest = readJson<Manifest | null>(manifestPath(dir), null);
				if (manifest?.serverUrl === serverUrl) {
					this.byGame.set(manifest.gameId, { dir, manifest });
				}
			}
		}
		this.publish();
	}

	private publish() {
		this.onChange(
			[...this.byGame.values()].map(({ dir, manifest: m }) => ({
				gameId: m.gameId,
				versionId: m.versionId,
				version: m.version,
				type: m.type,
				path: filesDir(dir),
				sizeBytes: m.sizeBytes,
				installedAt: m.installedAt,
			})),
		);
	}

	get(gameId: number) {
		return this.byGame.get(gameId);
	}

	ids(): number[] {
		return [...this.byGame.keys()];
	}

	/** Records a finished install. */
	add(dir: string, manifest: Manifest) {
		writeJson(manifestPath(dir), manifest);
		this.byGame.set(manifest.gameId, { dir, manifest });
		this.publish();
	}

	update(gameId: number, patch: Partial<Manifest>) {
		const entry = this.byGame.get(gameId);
		if (!entry) return;
		entry.manifest = { ...entry.manifest, ...patch };
		writeJson(manifestPath(entry.dir), entry.manifest);
	}

	async remove(gameId: number) {
		const entry = this.byGame.get(gameId);
		if (!entry) return;
		// Only ever delete a folder that Stault created.
		if (!existsSync(manifestPath(entry.dir))) {
			throw new Error("That folder no longer looks like a Stault install.");
		}
		await removeFolder(entry.dir);
		this.byGame.delete(gameId);
		this.publish();
	}
}
