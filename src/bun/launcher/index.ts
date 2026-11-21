import { type ChildProcess, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { Platform, PlayResult, ProgressState, Running } from "../../shared/model";
import type { GameVaultClient } from "../gamevault/client";
import type { ApiGame, ApiProgress } from "../gamevault/types";
import { filesDir, type Installs } from "../installs";
import {
	type Command,
	launchCommand,
	pickInstaller,
	setupCommand,
	splitArgs,
	targetFor,
	type UmuOptions,
} from "./command";
import { findExecutables, obviousChoice } from "./detect";

export interface LauncherDeps {
	platform: Platform;
	installs: Installs;
	logsDir: string;
	/** Where per-game Wine prefixes live (Linux). */
	prefixesDir: string;
	client(): GameVaultClient;
	userId(): number;
	/** The server's record of a game, for its launch settings. */
	game(gameId: number): ApiGame | undefined;
	progressState(gameId: number): ProgressState;
	onProgress(gameId: number, progress: ApiProgress): void;
	onRunning(running: Running | null): void;
	notify(text: string, sub?: string): void;
	/** Native file picker, for when the game's program can't be found. */
	pickFile(startIn: string): Promise<string | null>;
}

function findUmu(): string | null {
	const candidates = [
		Bun.which("umu-run"),
		join(homedir(), ".local", "bin", "umu-run"),
		"/usr/bin/umu-run",
		"/usr/local/bin/umu-run",
	];
	return candidates.find((path) => path && existsSync(path)) ?? null;
}

const NO_UMU =
	"Windows games on Linux run through umu-launcher, which isn't installed. Install it from github.com/Open-Wine-Components/umu-launcher, then try again.";

/** Starts a command, resolving once the process exists. */
function start(command: Command, logPath: string): Promise<ChildProcess> {
	mkdirSync(join(logPath, ".."), { recursive: true });
	const log = openSync(logPath, "w");
	return new Promise((resolve, reject) => {
		const child = spawn(command.argv[0], command.argv.slice(1), {
			cwd: command.cwd,
			env: { ...process.env, ...command.env },
			// Its own process group, so Stop can end the game and everything it started.
			detached: process.platform !== "win32",
			stdio: ["ignore", log, log],
		});
		child.once("spawn", () => resolve(child));
		child.once("error", (error) => reject(new Error(`The game could not be started: ${error.message}`)));
		child.once("close", () => closeSync(log));
	});
}

function killTree(child: ChildProcess) {
	if (child.pid === undefined) return;
	if (process.platform === "win32") {
		spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
		return;
	}
	const signal = (name: NodeJS.Signals) => {
		try {
			process.kill(-child.pid!, name);
		} catch {
			// Already gone.
		}
	};
	signal("SIGTERM");
	setTimeout(() => child.exitCode === null && signal("SIGKILL"), 5000).unref();
}

export class Launcher {
	private current: { gameId: number; child: ChildProcess; ticker: ReturnType<typeof setInterval> } | null = null;

	constructor(private readonly deps: LauncherDeps) {}

	private umu(gameId: number): UmuOptions | undefined {
		if (this.deps.platform !== "linux") return undefined;
		const umuRun = findUmu();
		if (!umuRun) throw new Error(NO_UMU);
		const meta = this.deps.game(gameId)?.metadata;
		return {
			umuRun,
			prefix: join(this.deps.prefixesDir, String(gameId)),
			gameId: meta?.umu_game_id,
			store: meta?.umu_store,
			protonPath: meta?.umu_proton_path,
		};
	}

	/** Finds the program that starts the game, or the choices when it is ambiguous. */
	private async resolve(gameId: number): Promise<string | { candidates: string[] }> {
		const { platform, installs } = this.deps;
		const entry = installs.get(gameId);
		if (!entry) throw new Error("This game isn't installed.");
		const { manifest, dir } = entry;
		const target = targetFor(platform, manifest.type);
		if (!target) throw new Error("This build can't run on this device.");
		const root = filesDir(dir);
		const within = (path: string) => (isAbsolute(path) ? path : join(root, path));

		if (manifest.executable && existsSync(within(manifest.executable))) {
			return within(manifest.executable);
		}
		const preset = this.deps.game(gameId)?.metadata?.launch_executable;
		if (preset && existsSync(join(root, preset))) return join(root, preset);

		const ignored = await this.deps.client().ignoredExecutables().catch(() => []);
		const candidates = await findExecutables(root, target, ignored);
		const choice = obviousChoice(candidates);
		if (choice) {
			installs.update(gameId, { executable: choice });
			return join(root, choice);
		}
		if (candidates.length > 1) return { candidates };

		if (target === "mac-app") {
			throw new Error("No Mac app was found in this game's files. It is probably a Windows or Linux build.");
		}
		// Typically a setup build whose installer put the game somewhere else.
		const picked = await this.deps.pickFile(root);
		if (!picked) throw new Error("Stault couldn't find the program that starts this game.");
		installs.update(gameId, { executable: picked });
		return picked;
	}

	setExecutable(gameId: number, path: string) {
		this.deps.installs.update(gameId, { executable: path });
	}

	async play(gameId: number): Promise<PlayResult> {
		if (this.current) {
			const title = this.deps.installs.get(this.current.gameId)?.manifest.title ?? "the running game";
			throw new Error(`One game at a time. Stop ${title} first.`);
		}
		const resolved = await this.resolve(gameId);
		if (typeof resolved !== "string") return { status: "pick", candidates: resolved.candidates };

		const meta = this.deps.game(gameId)?.metadata;
		const needsUmu = this.deps.platform === "linux" && resolved.toLowerCase().endsWith(".exe");
		const command = launchCommand(
			this.deps.platform,
			resolved,
			splitArgs(meta?.launch_parameters),
			needsUmu ? this.umu(gameId) : undefined,
		);
		const logPath = join(this.deps.logsDir, `${gameId}.log`);
		const child = await start(command, logPath);
		const startedAt = Date.now();
		const title = this.deps.installs.get(gameId)?.manifest.title ?? "Game";

		// One minute played, one minute credited.
		const ticker = setInterval(() => {
			const pending = (this.deps.installs.get(gameId)?.manifest.pendingMinutes ?? 0) + 1;
			this.deps.installs.update(gameId, { pendingMinutes: pending });
			void this.flush(gameId);
		}, 60_000);
		this.current = { gameId, child, ticker };
		this.deps.onRunning({ gameId, startedAt: new Date(startedAt).toISOString() });

		if (this.deps.progressState(gameId) === "UNPLAYED") {
			this.deps
				.client()
				.setProgressState(this.deps.userId(), gameId, "PLAYING")
				.then((progress) => this.deps.onProgress(gameId, progress))
				.catch(() => {});
		}

		child.once("close", (code) => {
			clearInterval(ticker);
			if (this.current?.child === child) this.current = null;
			this.deps.onRunning(null);
			if (code !== 0 && code !== null && Date.now() - startedAt < 5000) {
				this.deps.notify(`${title} closed right away`, `Launch log: ${logPath}`);
			}
		});
		return { status: "started" };
	}

	stop(gameId: number) {
		if (this.current?.gameId === gameId) killTree(this.current.child);
	}

	stopAll() {
		if (this.current) killTree(this.current.child);
	}

	/** Sends minutes the server hasn't been credited with yet. Failures are retried later. */
	async flush(gameId: number) {
		const pending = this.deps.installs.get(gameId)?.manifest.pendingMinutes ?? 0;
		if (pending <= 0) return;
		// Claim them first, so a second flush can't send the same minutes.
		this.deps.installs.update(gameId, { pendingMinutes: 0 });
		try {
			const progress = await this.deps.client().addMinutes(this.deps.userId(), gameId, pending);
			this.deps.onProgress(gameId, progress);
		} catch {
			const now = this.deps.installs.get(gameId)?.manifest.pendingMinutes ?? 0;
			this.deps.installs.update(gameId, { pendingMinutes: now + pending });
		}
	}

	/** Runs a setup build's installer and waits for it to finish. */
	async runSetup(gameId: number, extractedTo: string, installTo: string, signal: AbortSignal) {
		const meta = this.deps.game(gameId)?.metadata;
		const preset = meta?.installer_executable;
		const installer =
			preset && existsSync(join(extractedTo, preset))
				? preset
				: pickInstaller(
						await Array.fromAsync(
							new Bun.Glob("**/*.{exe,msi,EXE,MSI}").scan({ cwd: extractedTo }),
						),
					);
		if (!installer) throw new Error("No installer was found in this setup build.");

		const command = setupCommand(
			this.deps.platform,
			join(extractedTo, installer),
			meta?.installer_parameters,
			installTo,
			this.deps.platform === "linux" ? this.umu(gameId) : undefined,
		);
		const child = await start(command, join(this.deps.logsDir, `${gameId}-setup.log`));
		signal.addEventListener("abort", () => killTree(child), { once: true });
		await new Promise<void>((resolve) => child.once("close", () => resolve()));
	}
}
