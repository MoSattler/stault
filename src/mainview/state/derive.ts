import { useSyncExternalStore } from "react";
import { canRun, PLATFORM_NAME, typeLabel } from "../../shared/compat";
import type {
	AppState,
	Download,
	DownloadPhase,
	GameSummary,
	GameVersion,
	Install,
	ProgressState,
	SaveSync,
} from "../../shared/model";
import { api } from "../api";
import { formatBytes, formatHours } from "../format";
import { attempt, setUi, useApp } from "./store";

// One shared clock for "Playing · 12 min" labels, however many rows show one.
let clock = Date.now();
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | undefined;

function subscribeClock(listener: () => void) {
	clockListeners.add(listener);
	clockTimer ??= setInterval(() => {
		clock = Date.now();
		for (const l of clockListeners) l();
	}, 10_000);
	return () => {
		clockListeners.delete(listener);
		if (clockListeners.size === 0) {
			clearInterval(clockTimer);
			clockTimer = undefined;
		}
	};
}

/** The current time, refreshed a few times a minute. */
export function useNow(): number {
	return useSyncExternalStore(subscribeClock, () => clock);
}

export const PROGRESS_LABEL: Record<ProgressState, string> = {
	UNPLAYED: "Unplayed",
	INFINITE: "Endless",
	PLAYING: "Playing",
	COMPLETED: "Completed",
	ABORTED_TEMPORARY: "Paused",
	ABORTED_PERMANENT: "Dropped",
};

export type PrimaryIcon = "play" | "install" | "stop" | "pause" | "resume" | "busy" | "none";

export interface Primary {
	label: string;
	sub: string;
	icon: PrimaryIcon;
	/** Lime call to action, a neutral in-progress state, or unavailable. */
	tone: "accent" | "neutral" | "off";
	/** 0–100 progress shown behind the label. */
	fill: number;
	act(): void;
}

/** Everything the UI shows about one game beyond the server record. */
export interface GameStatus {
	install: Install | undefined;
	download: Download | undefined;
	running: boolean;
	/** Short status for list rows: "Installed · 41.5 h", "Downloading · 46%". */
	line: string;
	primary: Primary;
}

export const PHASES: { key: DownloadPhase | "ready"; label: string }[] = [
	{ key: "download", label: "Download" },
	{ key: "extract", label: "Extract" },
	{ key: "setup", label: "Run setup" },
	{ key: "ready", label: "Ready" },
];

const percent = (d: Download) => Math.floor(d.progress * 100);

function downloadLine(d: Download): string {
	if (d.error) return "Download failed";
	if (d.phase === "extract") return "Extracting…";
	if (d.phase === "setup") return "Installing…";
	return `${d.paused ? "Paused" : "Downloading"} · ${percent(d)}%`;
}

/** Starts a game, or opens the dialog for whatever has to be decided first. */
export async function play(gameId: number) {
	const result = await attempt(api.play({ gameId }));
	if (result?.status === "pick") {
		setUi({ picking: { gameId, candidates: result.candidates } });
	} else if (result?.status === "save-conflict") {
		setUi({ saveConflict: { gameId, thenPlay: true } });
	}
}

type Slice = Pick<AppState, "platform" | "installs" | "downloads" | "running" | "saves" | "saveSync">;

/** A few words on where a game's saves stand, for beside the Play button. */
export function saveLabel(
	save: SaveSync | undefined,
	sync: AppState["saveSync"],
): { text: string; alert: boolean } {
	if (!sync.enabled || sync.serverOff) return { text: "Off", alert: false };
	switch (save?.state) {
		case "syncing":
			return { text: "Syncing…", alert: false };
		case "pending":
			return { text: "Waiting to upload", alert: true };
		case "conflict":
			return { text: "Needs your choice", alert: true };
		case "unsupported":
			return { text: "Not synced", alert: false };
		case "idle":
			return { text: save.syncedAt ? "In sync" : "Nothing yet", alert: false };
		default:
			return { text: "—", alert: false };
	}
}

/**
 * `versions` is the full list when it is known (the game page). Without it,
 * only the server's default version can be judged.
 */
export function gameStatus(
	game: GameSummary,
	state: Slice,
	now: number,
	versions?: GameVersion[],
): GameStatus {
	const install = state.installs.find((i) => i.gameId === game.id);
	const download = state.downloads.find((d) => d.gameId === game.id);
	const running = state.running?.gameId === game.id;
	const gameId = game.id;

	let line: string;
	let primary: Primary;

	if (running && state.running) {
		const minutes = Math.max(0, Math.floor((now - Date.parse(state.running.startedAt)) / 60_000));
		line = "Playing now";
		primary = { label: "Stop", sub: `Playing · ${minutes} min`, icon: "stop", tone: "neutral", fill: 0, act: () => attempt(api.stop({ gameId })) };
	} else if (download) {
		line = downloadLine(download);
		const toggle = () => attempt(api.setDownloadPaused({ gameId, paused: !download.paused }));
		if (download.error) {
			primary = { label: "Download failed", sub: "Try again", icon: "resume", tone: "neutral", fill: 0, act: () => attempt(api.setDownloadPaused({ gameId, paused: false })) };
		} else if (download.phase === "download") {
			primary = {
				label: `${download.paused ? "Paused" : "Downloading"} ${percent(download)}%`,
				sub: download.paused ? "Resume" : "Pause",
				icon: download.paused ? "resume" : "pause",
				tone: "neutral",
				fill: download.progress * 100,
				act: toggle,
			};
		} else if (download.phase === "extract") {
			primary = { label: "Extracting", sub: `${percent(download)}%`, icon: "busy", tone: "neutral", fill: download.progress * 100, act() {} };
		} else {
			primary = { label: "Running installer", sub: "Waiting for setup to finish", icon: "busy", tone: "neutral", fill: 100, act() {} };
		}
	} else if (install && state.saveSync.enabled && state.saves.find((s) => s.gameId === gameId)?.state === "syncing") {
		// Saves are moving: before a start, after a session, or by hand.
		line = "Syncing saves…";
		primary = { label: "Syncing saves", sub: "", icon: "busy", tone: "neutral", fill: 0, act() {} };
	} else if (install) {
		line = `Installed · ${game.minutesPlayed ? formatHours(game.minutesPlayed) : "new"}`;
		primary = { label: "Play", sub: "", icon: "play", tone: "accent", fill: 0, act: () => play(gameId) };
	} else {
		line = "Not installed";
		const runnable = (versions ?? [game]).filter(
			(v) => canRun(state.platform, v.type, v.version) !== "no",
		);
		if (runnable.length === 0) {
			const others = new Set((versions ?? [game]).map((v) => typeLabel(v.type, v.version).os));
			primary = { label: `Not on ${PLATFORM_NAME[state.platform]}`, sub: `${[...others].join(" and ")} only`, icon: "none", tone: "off", fill: 0, act() {} };
		} else {
			const sub = runnable.length > 1 ? `${runnable.length} versions · choose next` : formatBytes(runnable[0].sizeBytes);
			primary = { label: "Install", sub, icon: "install", tone: "accent", fill: 0, act: () => setUi({ installing: { gameId } }) };
		}
	}

	return { install, download, running, line, primary };
}

/** Status of one game, kept current as downloads and sessions change. */
export function useGameStatus(game: GameSummary, versions?: GameVersion[]): GameStatus {
	const platform = useApp((s) => s.platform);
	const installs = useApp((s) => s.installs);
	const downloads = useApp((s) => s.downloads);
	const running = useApp((s) => s.running);
	const saves = useApp((s) => s.saves);
	const saveSync = useApp((s) => s.saveSync);
	const now = useNow();
	return gameStatus(game, { platform, installs, downloads, running, saves, saveSync }, now, versions);
}

/** Server name as shown in the UI: "vault.lan". */
export function serverHost(serverUrl: string): string {
	try {
		return new URL(serverUrl).host;
	} catch {
		return serverUrl;
	}
}
