import { mkdir, open, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Download, DownloadPhase, GameType } from "../shared/model";
import { extract } from "./extract";
import { freeBytes, removeFolder } from "./folders";
import { OfflineError, type GameVaultClient } from "./gamevault/client";
import { filesDir, folderSize, gameDir, type Installs, workDir } from "./installs";
import { readJson, writeJson } from "./json-file";

/** One queued install. Everything needed to pick it up again after a restart. */
export interface QueueItem {
	gameId: number;
	versionId: number;
	title: string;
	version: string | null;
	type: GameType;
	totalBytes: number;
	/** Bytes on disk so far, remembered so a paused item still shows its progress. */
	receivedBytes: number;
	/** The game's folder inside a library folder. */
	dir: string;
	/** Archive name on the server; its extension tells 7-Zip the format. */
	fileName: string;
	paused: boolean;
	error: string | null;
}

interface Active {
	item: QueueItem;
	phase: DownloadPhase;
	received: number;
	progress: number;
	speed: number;
	abort: AbortController;
	/** Settles when this run has let go of its files. */
	done: Promise<void>;
}

export interface DownloadDeps {
	queuePath: string;
	sevenZip: string;
	installs: Installs;
	client(): GameVaultClient;
	serverUrl(): string;
	speedLimitKib(): number;
	/** Runs a setup-type game's installer. Resolves when the installer exits. */
	runSetup(item: QueueItem, extractedTo: string, installTo: string, signal: AbortSignal): Promise<void>;
	onChange(downloads: Download[]): void;
	onInstalled(item: QueueItem): void;
}

/** Thrown inside a run to stop it quietly (pause, cancel, restart). */
class Stopped extends Error {}

const partPath = (item: QueueItem) => join(workDir(item.dir), "download", `${item.fileName}.part`);

async function sizeOf(path: string): Promise<number> {
	return (await stat(path).catch(() => null))?.size ?? 0;
}

/**
 * The install queue. One item is worked on at a time, in order:
 * download (resumable) → extract → run setup (setup builds) → installed.
 */
export class Downloads {
	private queue: QueueItem[];
	private active: Active | null = null;
	private halted = true;
	private lastPublish = 0;
	private publishTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(private readonly deps: DownloadDeps) {
		this.queue = readJson<QueueItem[]>(deps.queuePath, []);
	}

	/** Call once signed in: shows the saved queue and carries on with it. */
	start() {
		this.halted = false;
		this.pump();
	}

	/** Signing out: stop, and drop the queue with its half-finished files. */
	async clear() {
		this.halted = true;
		await this.stopActive();
		const dropped = this.queue;
		this.queue = [];
		this.save();
		this.publish(true);
		await Promise.all(dropped.map((q) => removeFolder(q.dir)));
	}

	has(gameId: number) {
		return this.queue.some((q) => q.gameId === gameId);
	}

	// --- Queue edits -------------------------------------------------------

	async enqueue(
		input: Omit<QueueItem, "dir" | "paused" | "error" | "receivedBytes">,
		folder: string,
	) {
		if (this.has(input.gameId)) throw new Error(`${input.title} is already in the queue.`);
		const dir = gameDir(folder, input.title, input.gameId);
		// Switching versions: the old files go first, the new ones land in the same place.
		await this.deps.installs.remove(input.gameId);
		await removeFolder(dir);
		this.queue.push({ ...input, dir, receivedBytes: 0, paused: false, error: null });
		this.save();
		this.pump();
	}

	setPaused(gameId: number, paused: boolean) {
		const item = this.queue.find((q) => q.gameId === gameId);
		if (!item) return;
		item.paused = paused;
		item.error = null;
		if (paused && this.active?.item === item) void this.stopActive();
		this.save();
		this.pump();
	}

	setAllPaused(paused: boolean) {
		for (const item of this.queue) {
			item.paused = paused;
			item.error = null;
		}
		if (paused) void this.stopActive();
		this.save();
		this.pump();
	}

	async remove(gameId: number) {
		const item = this.queue.find((q) => q.gameId === gameId);
		if (!item) return;
		const running = this.active?.item === item;
		if (running && this.active?.phase !== "download") {
			throw new Error(`${item.title} is already being installed.`);
		}
		// Out of the queue before its run stops, or the end of the run starts it again.
		this.queue = this.queue.filter((q) => q !== item);
		this.save();
		if (running) await this.stopActive();
		await removeFolder(item.dir);
		this.pump();
	}

	moveUp(gameId: number) {
		const i = this.queue.findIndex((q) => q.gameId === gameId);
		if (i < 1) return;
		[this.queue[i - 1], this.queue[i]] = [this.queue[i], this.queue[i - 1]];
		// Whatever is first in line is what should be running.
		if (this.active && this.active.item !== this.next()) void this.stopActive();
		this.save();
		this.pump();
	}

	/** The speed limit is sent with the request, so a change restarts the transfer. */
	speedLimitChanged() {
		void this.stopActive();
	}

	// --- Running -----------------------------------------------------------

	private next() {
		return this.queue.find((q) => !q.paused && !q.error);
	}

	/**
	 * Interrupts the running download; the queue carries on by itself once the
	 * run has closed its file. Extraction and setup are left to finish.
	 */
	private async stopActive() {
		const run = this.active;
		if (!run) return;
		if (run.phase === "download") run.abort.abort(new Stopped());
		await run.done;
	}

	private pump() {
		this.publish(true);
		if (this.active || this.halted) return;
		const item = this.next();
		if (!item) return;
		const run: Active = {
			item,
			phase: "download",
			received: item.receivedBytes,
			progress: item.receivedBytes / item.totalBytes,
			speed: 0,
			abort: new AbortController(),
			done: Promise.resolve(),
		};
		this.active = run;
		run.done = this.run(run)
			.then(() => {
				this.queue = this.queue.filter((q) => q !== item);
				this.deps.onInstalled(item);
			})
			.catch((error) => {
				if (error instanceof Stopped || run.abort.signal.aborted) return;
				item.error =
					error instanceof OfflineError
						? "The connection to the server was lost."
						: error instanceof Error
							? error.message
							: String(error);
			})
			.finally(() => {
				item.receivedBytes = run.received;
				this.active = null;
				this.save();
				this.pump();
			});
	}

	private async run(run: Active) {
		const { item } = run;
		const signal = run.abort.signal;
		const part = partPath(item);
		const archive = part.slice(0, -".part".length);
		await mkdir(join(workDir(item.dir), "download"), { recursive: true });

		if (!(await sizeOf(archive))) {
			await this.download(run, part);
			await rename(part, archive);
		}

		// Setup builds are extracted aside and then install themselves into files/.
		const isSetup = item.type === "WINDOWS_SETUP";
		const target = filesDir(item.dir);
		const extractTo = isSetup ? join(workDir(item.dir), "setup") : target;
		this.enter(run, "extract");
		await removeFolder(extractTo);
		await extract(this.deps.sevenZip, archive, extractTo, (fraction) => {
			run.progress = fraction;
			this.publish();
		});
		await removeFolder(join(workDir(item.dir), "download"));

		if (isSetup) {
			this.enter(run, "setup");
			await mkdir(target, { recursive: true });
			await this.deps.runSetup(item, extractTo, target, signal);
			await removeFolder(extractTo);
		}

		this.deps.installs.add(item.dir, {
			serverUrl: this.deps.serverUrl(),
			gameId: item.gameId,
			versionId: item.versionId,
			version: item.version,
			type: item.type,
			title: item.title,
			installedAt: new Date().toISOString(),
			sizeBytes: await folderSize(target),
		});
	}

	private enter(run: Active, phase: DownloadPhase) {
		run.phase = phase;
		run.progress = 0;
		run.speed = 0;
		this.publish(true);
	}

	private async download(run: Active, part: string) {
		const { item } = run;
		let offset = await sizeOf(part);
		if (offset > item.totalBytes) offset = 0;

		const free = await freeBytes(item.dir);
		// The archive and its extracted copy sit side by side for a moment.
		if (free !== null && free < (item.totalBytes - offset) * 1.1) {
			throw new Error("Not enough free space in this library folder.");
		}

		const response = await this.deps.client().download(item.gameId, item.versionId, {
			offset,
			speedLimitKib: this.deps.speedLimitKib(),
			signal: run.abort.signal,
		});
		// GameVault answers 200 even to a range request; the length tells whether it
		// honoured the range (the remainder) or is sending the whole file again.
		const length = Number(response.headers.get("Content-Length"));
		const resumed = response.status === 206 || length === item.totalBytes - offset;
		if (offset > 0 && !resumed) offset = 0;
		// A fresh transfer states the real size (single-file games arrive wrapped in a tar).
		if (offset === 0 && length > 0) item.totalBytes = length;
		if (!response.body) throw new Error("The server sent no data.");

		run.received = offset;
		run.progress = offset / item.totalBytes;
		const file = await open(part, offset > 0 ? "a" : "w");
		let windowStart = Date.now();
		let windowBytes = 0;
		try {
			const reader = response.body.getReader();
			for (;;) {
				const { done, value: chunk } = await reader.read();
				if (done) break;
				await file.write(chunk);
				run.received += chunk.byteLength;
				windowBytes += chunk.byteLength;
				const elapsed = Date.now() - windowStart;
				if (elapsed >= 1000) {
					run.speed = (windowBytes * 1000) / elapsed;
					windowStart = Date.now();
					windowBytes = 0;
				}
				run.progress = run.received / item.totalBytes;
				this.publish();
			}
		} catch (error) {
			if (run.abort.signal.aborted) throw new Stopped();
			throw error instanceof OfflineError ? error : new OfflineError(this.deps.serverUrl());
		} finally {
			await file.close();
		}
		if (run.received < item.totalBytes) throw new OfflineError(this.deps.serverUrl());
	}

	// --- Reporting ---------------------------------------------------------

	private save() {
		writeJson(this.deps.queuePath, this.queue);
	}

	/** Tells the UI, at most four times a second unless forced. */
	private publish(force = false) {
		clearTimeout(this.publishTimer);
		const wait = 250 - (Date.now() - this.lastPublish);
		if (!force && wait > 0) {
			this.publishTimer = setTimeout(() => this.publish(true), wait);
			return;
		}
		this.lastPublish = Date.now();
		this.deps.onChange(
			this.queue.map((item): Download => {
				const run = this.active?.item === item ? this.active : null;
				return {
					gameId: item.gameId,
					versionId: item.versionId,
					title: item.title,
					version: item.version,
					type: item.type,
					phase: run?.phase ?? "download",
					paused: item.paused,
					receivedBytes: run?.received ?? item.receivedBytes,
					totalBytes: item.totalBytes,
					bytesPerSecond: run?.speed ?? 0,
					progress: run?.progress ?? item.receivedBytes / item.totalBytes,
					error: item.error,
				};
			}),
		);
	}
}
