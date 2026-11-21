import { realpathSync, statSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GameType, Platform, PlayResult, SaveConflict, SaveSync } from "../../shared/model";
import { extract, zipFolder } from "../extract";
import { ApiError, parseSaveName, type GameVaultClient, type ServerSave } from "../gamevault/client";
import { filesDir, type Installs, type SaveRecord, workDir } from "../installs";
import { readJson, writeJson } from "../json-file";
import type { GameLocation, Ludusavi } from "./ludusavi";

/** How sure Ludusavi has to be that a title is the game it knows. */
const MATCH = 0.8;
/** Stault adds this file to a save, to say which kind of build it is for and which device made it. */
const MARKER = "stault.json";

/**
 * Saves only fit builds of the same kind. A Windows build keeps its saves in the
 * same places on Windows and inside a Wine prefix on Linux, so those two share.
 */
export type SaveKind = "mac" | "linux" | "windows";

export function saveKind(platform: Platform, type: GameType): SaveKind {
	if (platform === "macos") return "mac";
	return platform === "linux" && type.startsWith("LINUX") ? "linux" : "windows";
}

export type Step = "nothing" | "upload" | "restore" | "compare";

/**
 * What keeps two devices from overwriting each other: a save this device has
 * not seen is never replaced on the server, and saves the server has not seen
 * are never replaced here. When both exist, they are compared before anything moves.
 */
export function nextStep(serverHasNewSave: boolean, changedHere: boolean): Step {
	if (serverHasNewSave) return changedHere ? "compare" : "restore";
	return changedHere ? "upload" : "nothing";
}

export type Outcome = "skipped" | "synced" | "uploaded" | "restored" | "conflict" | "offline";

/** The server did not answer, as opposed to answering with an error. */
class Unreachable extends Error {}

/** A save fetched from the server and unpacked, not yet applied. */
interface Incoming {
	save: ServerSave;
	kind: SaveKind;
	/** Name of the device that uploaded it, when it said so. */
	device: string | null;
	/** The unpacked Ludusavi backup. */
	root: string;
	/** Scratch folder holding it. */
	work: string;
}

export interface SavesDeps {
	platform: Platform;
	ludusavi: Ludusavi;
	sevenZip: string;
	installs: Installs;
	home: string;
	/** Where per-game Wine prefixes live (Linux). */
	prefixesDir: string;
	/** The user's setting. */
	enabled(): boolean;
	/** This device's name, sent along with its saves. */
	deviceName(): string;
	client(): GameVaultClient;
	userId(): number;
	/** Names to look the game up by, best first. */
	titles(gameId: number): string[];
	/** The game being played, if any. Its saves are in use. */
	running(): number | null;
	onChange(saves: SaveSync[], serverOff: boolean): void;
	notify(text: string, sub?: string): void;
}

const iso = (ms: number | undefined) => (ms ? new Date(ms).toISOString() : null);

/** When the newest of these files was last written, or undefined if none can be read. */
function lastChanged(files: string[]): number | undefined {
	const times = files.flatMap((file) => {
		try {
			return [statSync(file).mtimeMs];
		} catch {
			return [];
		}
	});
	return times.length ? Math.max(...times) : undefined;
}

/**
 * Ludusavi reports files by their real path, so the folders it is told about
 * must be real paths too, or a symlinked home or library folder (a Steam Deck's
 * /home, a drive linked into ~/Games) would not be recognised as such.
 */
function real(path: string): string {
	try {
		return realpathSync.native(path);
	} catch {
		return path;
	}
}

/**
 * Keeps each installed game's saves in step with the server.
 * Ludusavi finds and moves the files; the GameVault server stores them as zips.
 */
export class Saves {
	private queue: Promise<unknown> = Promise.resolve();
	private busy = new Set<number>();
	/** Games where both sides changed, with what the user needs to choose. */
	private conflicts = new Map<number, SaveConflict>();
	private serverOff = false;
	/** Whether this session has asked the server if it takes save files. */
	private asked = false;

	constructor(private readonly deps: SavesDeps) {}

	/** A new session: forget what the last server said. */
	reset() {
		this.serverOff = false;
		this.asked = false;
		this.conflicts.clear();
		this.publish();
	}

	/** Tells the UI where every installed game's saves stand. */
	publish() {
		const { installs } = this.deps;
		this.deps.onChange(
			installs.ids().map((gameId): SaveSync => {
				const record = installs.get(gameId)?.manifest.saves;
				const conflict = this.conflicts.get(gameId);
				return {
					gameId,
					state: this.busy.has(gameId)
						? "syncing"
						: !record
							? "unknown"
							: !record.name
								? "unsupported"
								: conflict
									? "conflict"
									: record.pending
										? "pending"
										: "idle",
					name: record?.name ?? null,
					syncedAt: iso(record?.syncedAt),
					...(conflict ? { conflict } : {}),
				};
			}),
			this.serverOff,
		);
	}

	private get usable(): boolean {
		return this.deps.enabled() && !this.serverOff && this.deps.ludusavi.available;
	}

	/** One at a time: every run rewrites Ludusavi's settings for its game. */
	private exclusive<T>(task: () => Promise<T>): Promise<T> {
		const run = this.queue.then(task);
		this.queue = run.catch(() => {});
		return run;
	}

	private where(gameId: number): GameLocation {
		const { dir, manifest } = this.deps.installs.get(gameId)!;
		const winePrefix =
			this.deps.platform === "linux" && !manifest.type.startsWith("LINUX")
				? join(this.deps.prefixesDir, String(gameId))
				: undefined;
		const gameDir = real(dir);
		return {
			gameDir,
			filesDir: filesDir(gameDir),
			userDir: real(winePrefix ? join(winePrefix, "drive_c", "users", "steamuser") : this.deps.home),
			winePrefix,
		};
	}

	private update(gameId: number, patch: Partial<SaveRecord>) {
		const current = this.deps.installs.get(gameId)?.manifest.saves;
		if (current) this.deps.installs.update(gameId, { saves: { ...current, ...patch } });
	}

	/** The game's save record, looking the game up in Ludusavi the first time. */
	private async record(gameId: number): Promise<SaveRecord> {
		const known = this.deps.installs.get(gameId)!.manifest.saves;
		if (known) return known;
		let name: string | null = null;
		for (const title of this.deps.titles(gameId)) {
			const hit = await this.deps.ludusavi.find(this.where(gameId), title);
			if (hit && hit.score >= MATCH) {
				name = hit.name;
				break;
			}
		}
		const record: SaveRecord = { installationId: crypto.randomUUID(), name };
		this.deps.installs.update(gameId, { saves: record });
		return record;
	}

	/**
	 * Brings one game's saves in step. "upload" and "download" are the user's
	 * explicit choice and go ahead even when the other side changed.
	 */
	sync(gameId: number, mode: "auto" | "upload" | "download" = "auto", signal?: AbortSignal): Promise<Outcome> {
		return this.exclusive(async () => {
			if (!this.usable || !this.deps.installs.get(gameId)) return "skipped";
			if (this.deps.running() === gameId) {
				if (mode === "auto") return "skipped";
				throw new Error("Stop the game first.");
			}
			this.busy.add(gameId);
			this.publish();
			try {
				return await this.run(gameId, mode, signal);
			} catch (error) {
				if (error instanceof Unreachable) return "offline";
				if (error instanceof ApiError && error.status === 405) {
					this.serverOff = true;
					return "skipped";
				}
				throw error;
			} finally {
				this.busy.delete(gameId);
				this.publish();
			}
		});
	}

	private async run(gameId: number, mode: "auto" | "upload" | "download", signal?: AbortSignal): Promise<Outcome> {
		const { ludusavi, installs } = this.deps;
		const record = await this.record(gameId);
		const name = record.name;
		if (!name) return "skipped";
		this.conflicts.delete(gameId);

		const { dir, manifest } = installs.get(gameId)!;
		const where = this.where(gameId);
		const baseline = join(workDir(dir), "saves");
		const local = await ludusavi.scan(where, name, baseline);
		// Remembered, so saves made while the server was away still go up later.
		const changedHere = local.found && (record.pending || local.changed);
		if (changedHere !== !!record.pending) this.update(gameId, { pending: changedHere });

		const newest = await this.reach(() => this.deps.client().newestSave(this.deps.userId(), gameId, signal));

		if (mode === "upload") {
			if (!local.found) throw new Error("Stault found no saves for this game on this device.");
			await this.upload(gameId, name);
			return "uploaded";
		}
		if (mode === "download") {
			if (!newest) throw new Error("The server has no save for this game.");
			const incoming = await this.fetchSave(gameId, signal);
			if (incoming.kind !== saveKind(this.deps.platform, manifest.type)) {
				await rm(incoming.work, { recursive: true, force: true });
				throw new Error("The server's save is from another operating system and can't be used here.");
			}
			await this.restore(gameId, name, incoming, changedHere);
			return "restored";
		}

		const unseen =
			newest !== null && newest.uploadedAt !== record.syncedAt && newest.uploadedAt !== record.foreignAt;
		if (unseen) {
			const incoming = await this.fetchSave(gameId, signal);
			if (incoming.kind !== saveKind(this.deps.platform, manifest.type)) {
				// Another OS's build of this game uploaded it. Leave it, and carry on as if it weren't there.
				this.update(gameId, { foreignAt: incoming.save.uploadedAt });
				await rm(incoming.work, { recursive: true, force: true });
			} else if (nextStep(true, changedHere) === "restore") {
				await this.restore(gameId, name, incoming, false);
				return "restored";
			} else if ((await ludusavi.scan(where, name, incoming.root)).changed) {
				this.conflicts.set(gameId, {
					serverAt: iso(incoming.save.uploadedAt)!,
					serverDevice: incoming.device,
					localAt: iso(lastChanged(local.files)),
				});
				await rm(incoming.work, { recursive: true, force: true });
				return "conflict";
			} else {
				// Both sides hold the same saves (a reinstall, say): nothing to move.
				await this.adopt(gameId, incoming);
				return "synced";
			}
		}
		if (nextStep(false, changedHere) === "upload") {
			await this.upload(gameId, name);
			return "uploaded";
		}
		return "synced";
	}

	/** Runs a server call, telling "no answer" apart from an error answer. */
	private async reach<T>(call: () => Promise<T>): Promise<T> {
		try {
			return await call();
		} catch (error) {
			if (error instanceof ApiError) throw error;
			throw new Unreachable();
		}
	}

	private async upload(gameId: number, name: string) {
		const { dir, manifest } = this.deps.installs.get(gameId)!;
		const baseline = join(workDir(dir), "saves");
		const zip = join(workDir(dir), "saves-upload.zip");
		this.update(gameId, { pending: true });
		await this.deps.ludusavi.backup(this.where(gameId), name, baseline);
		writeJson(join(baseline, MARKER), {
			kind: saveKind(this.deps.platform, manifest.type),
			device: this.deps.deviceName(),
		});
		await rm(zip, { force: true });
		await zipFolder(this.deps.sevenZip, baseline, zip);
		try {
			const client = this.deps.client();
			const { installationId } = this.deps.installs.get(gameId)!.manifest.saves!;
			const newest = await this.reach(async () => {
				await client.uploadSave(this.deps.userId(), gameId, Bun.file(zip), installationId);
				// The server names the save by its upload time; ask what it called ours.
				return client.newestSave(this.deps.userId(), gameId);
			});
			this.update(gameId, {
				pending: false,
				...(newest?.installationId === installationId ? { syncedAt: newest.uploadedAt } : {}),
			});
		} finally {
			await rm(zip, { force: true });
		}
	}

	/** Downloads and unpacks the server's newest save, without applying it. */
	private async fetchSave(gameId: number, signal?: AbortSignal): Promise<Incoming> {
		const { dir } = this.deps.installs.get(gameId)!;
		const work = join(workDir(dir), "saves-incoming");
		const zip = join(work, "save.zip");
		const content = join(work, "content");
		await rm(work, { recursive: true, force: true });
		await mkdir(work, { recursive: true });
		const save = await this.reach(async () => {
			const response = await this.deps.client().downloadSave(this.deps.userId(), gameId, signal);
			await Bun.write(zip, response);
			return parseSaveName(response.headers.get("Content-Disposition"));
		});
		await extract(this.deps.sevenZip, zip, content, () => {});
		// A Ludusavi backup is a folder per game, each with a mapping.yaml.
		const [mapping] = await Array.fromAsync(new Bun.Glob("**/mapping.yaml").scan({ cwd: content }));
		if (!save || !mapping) throw new Error("The server's save is not in a form Stault understands.");
		const root = join(content, dirname(dirname(mapping)));
		// The official client writes no marker, and only runs on Windows.
		const marker = readJson<{ kind?: SaveKind; device?: string }>(join(root, MARKER), {});
		return { save, kind: marker.kind ?? "windows", device: marker.device ?? null, root, work };
	}

	/** Makes a fetched save the one this device is in step with. */
	private async adopt(gameId: number, incoming: Incoming) {
		const baseline = join(workDir(this.deps.installs.get(gameId)!.dir), "saves");
		await rm(baseline, { recursive: true, force: true });
		await rename(incoming.root, baseline);
		await rm(incoming.work, { recursive: true, force: true });
		this.update(gameId, { syncedAt: incoming.save.uploadedAt, pending: false });
	}

	private async restore(gameId: number, name: string, incoming: Incoming, keepCopy: boolean) {
		const { dir, manifest } = this.deps.installs.get(gameId)!;
		if (keepCopy) {
			// These saves never reached the server. Keep the last such set, in case the choice was wrong.
			const replaced = join(workDir(dir), "saves-replaced");
			await rm(replaced, { recursive: true, force: true });
			await this.deps.ludusavi.backup(this.where(gameId), name, replaced);
		}
		await this.deps.ludusavi.restore(this.where(gameId), name, incoming.root);
		await this.adopt(gameId, incoming);
		this.deps.notify(
			`${manifest.title}: saves restored`,
			`Uploaded ${new Date(incoming.save.uploadedAt).toLocaleString()}`,
		);
	}

	/** Syncs without anyone waiting for it, reporting what happened as a notice. */
	private background(gameId: number) {
		const title = this.deps.installs.get(gameId)?.manifest.title ?? "Game";
		this.sync(gameId).then(
			(outcome) => {
				if (outcome === "uploaded") this.deps.notify(`${title}: saves uploaded`);
				if (outcome === "conflict") {
					this.deps.notify(`${title}: saves changed on another device too`, "Choose which to keep on the game's page");
				}
			},
			(error) => this.deps.notify(`${title}: saves were not synced`, error instanceof Error ? error.message : String(error)),
		);
	}

	/** Before a game starts: fetch a newer save, or hand the launcher a conflict to ask about. */
	async beforePlay(gameId: number): Promise<PlayResult | null> {
		try {
			// A slow server must not hold up the game; after this long it starts with the saves it has.
			const outcome = await this.sync(gameId, "auto", AbortSignal.timeout(20_000));
			if (outcome === "conflict") return { status: "save-conflict" };
		} catch (error) {
			this.deps.notify("Saves were not synced", error instanceof Error ? error.message : String(error));
		}
		return null;
	}

	/** After a game exits, and after it is installed. */
	changed(gameId: number) {
		this.background(gameId);
	}

	/**
	 * Asks the server, once per session, whether it takes save files at all, so
	 * the UI can say so before the first game is played.
	 */
	async checkServer() {
		const [gameId] = this.deps.installs.ids();
		if (this.asked || gameId === undefined || !this.deps.enabled()) return;
		this.asked = true;
		try {
			await this.deps.client().newestSave(this.deps.userId(), gameId);
		} catch (error) {
			if (error instanceof ApiError && error.status === 405) {
				this.serverOff = true;
				this.publish();
			} else if (!(error instanceof ApiError)) {
				// No answer: ask again next time.
				this.asked = false;
			}
		}
	}

	/** Looks up installs Stault has not seen yet, and retries uploads that are waiting. */
	catchUp() {
		const { installs } = this.deps;
		void this.checkServer();
		if (!this.usable) return;
		for (const gameId of installs.ids()) {
			const record = installs.get(gameId)?.manifest.saves;
			if (!record) {
				void this.exclusive(() => this.record(gameId)).then(
					() => this.publish(),
					() => {},
				);
			} else if (record.pending && !this.conflicts.has(gameId)) {
				this.background(gameId);
			}
		}
	}

	/** Entries the user can choose from when the automatic match is missing or wrong. */
	search(gameId: number, query: string): Promise<string[]> {
		if (!this.deps.installs.get(gameId) || !query.trim()) return Promise.resolve([]);
		return this.exclusive(() => this.deps.ludusavi.search(this.where(gameId), query.trim()));
	}

	/** Sets which Ludusavi entry the game follows. Null turns sync off for it. */
	async setName(gameId: number, name: string | null) {
		const entry = this.deps.installs.get(gameId);
		if (!entry) return;
		await this.exclusive(async () => {
			const record = await this.record(gameId);
			// What was synced under the old entry says nothing about the new one.
			await rm(join(workDir(entry.dir), "saves"), { recursive: true, force: true });
			this.deps.installs.update(gameId, { saves: { installationId: record.installationId, name } });
			this.conflicts.delete(gameId);
		});
		this.publish();
		if (name) this.background(gameId);
	}

}
