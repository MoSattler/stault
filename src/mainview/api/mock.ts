// Stand-in for the main process when the UI runs in a plain browser
// (`hutch run hmr`). Sample library taken from design/Main.dc.html.
// URL switches: ?platform=macos|windows|linux, ?signedout, ?savesoff (the server has save files switched off),
// ?sso (the server also offers single sign-on), ?sso=only (it offers nothing else)

import { canRun } from "../../shared/compat";
import type {
	AppState,
	Download,
	GameDetail,
	GameType,
	GameVersion,
	Platform,
	ProgressState,
	SaveState,
	SignInMethod,
} from "../../shared/model";
import type { Pushes } from "../../shared/rpc";
import type { StaultApi } from "./index";

const GB = 1024 ** 3;
const DAY = 86_400_000;
const params = new URLSearchParams(location.search);
const methods: SignInMethod[] = !params.has("sso")
	? ["basic"]
	: params.get("sso") === "only" ? ["sso"] : ["basic", "sso"];
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

let nextVersionId = 100;
const win = (version: string, kind: "S" | "P", gb: number, ea = false): GameVersion => ({
	id: nextVersionId++,
	version: `v${version}`,
	type: kind === "S" ? "WINDOWS_SETUP" : "WINDOWS_PORTABLE",
	sizeBytes: gb * GB,
	earlyAccess: ea,
});
const linux = (version: string, gb: number): GameVersion => ({
	id: nextVersionId++,
	version: `v${version}`,
	type: "LINUX_PORTABLE",
	sizeBytes: gb * GB,
	earlyAccess: false,
});
// The server can't detect Mac builds; a label that names macOS marks one.
const mac = (version: string, gb: number): GameVersion => ({
	id: nextVersionId++,
	version: `v${version} · macOS`,
	type: "UNDETECTABLE",
	sizeBytes: gb * GB,
	earlyAccess: false,
});

function game(
	id: number,
	title: string,
	developer: string,
	releaseYear: number,
	genres: string[],
	versions: GameVersion[],
	installed: boolean,
	hours: number,
	lastPlayedDays: number | null,
	progressState: ProgressState,
	addedDays: number,
	description: string,
	publisher?: string,
): GameDetail & { installed: boolean } {
	return {
		id,
		title,
		sortTitle: title.toLowerCase(),
		coverUrl: null,
		backgroundUrl: null,
		genres,
		developers: [developer],
		releaseYear,
		addedAt: ago(addedDays),
		version: versions[0].version,
		type: versions[0].type,
		sizeBytes: versions[0].sizeBytes,
		versions,
		minutesPlayed: Math.round(hours * 60),
		lastPlayedAt: lastPlayedDays === null ? null : ago(lastPlayedDays),
		progressState,
		description,
		publishers: publisher ? [publisher] : [],
		installed,
	};
}

const seed = [
	game(1, "Saltmarsh", "Low Tide Co.", 2024, ["Adventure", "Exploration"], [win("1.4.2", "P", 3.2), linux("1.4.2", 3.0)], true, 41.5, 1, "PLAYING", 1, "Sail a flooded coastline in a hand-built skiff, mapping tide pools and trading with the stilt towns that survived the rising water.", "Harbour Light Publishing"),
	game(2, "Hollow Signal", "Kestrel Works", 2023, ["Horror", "Puzzle"], [win("2.0.1", "S", 11.8)], true, 12.2, 3, "PLAYING", 4, "A numbers station keeps broadcasting from an island that sank in 1962. Tune, decode and survive the night shift alone."),
	game(3, "Orbital Gardens", "Paperplane Labs", 2025, ["Simulation", "Building"], [win("0.9.7", "P", 1.1, true), win("0.9.5", "P", 1.0, true)], true, 87, 8, "PLAYING", 2, "Grow a greenhouse ring around a dying moon. Balance light, water and a crew that keeps naming the tomatoes."),
	game(4, "Northbound", "Fieldnote Games", 2021, ["Strategy", "Survival"], [win("1.12", "S", 24.6), win("1.12", "P", 22.9), win("1.0", "S", 18.1)], false, 19, 240, "ABORTED_TEMPORARY", 6, "Lead a caravan across a frozen continent. Every mile costs fuel, food or a friend."),
	game(5, "Ember Protocol", "Redline Studio", 2022, ["Action", "Roguelite"], [win("1.0.6", "P", 2.4)], false, 0, null, "UNPLAYED", 3, "Breach a burning arcology floor by floor. Runs are short, upgrades are permanent, the fire is not."),
	game(6, "Glasswing", "Moth & Lamp", 2024, ["Platformer"], [win("1.2.0", "P", 0.9), linux("1.2.0", 0.8)], true, 14.3, 0, "COMPLETED", 5, "A precision platformer about a moth that refuses to fly toward the light."),
	game(7, "Ironwood Keep", "Old Oak Interactive", 2020, ["RPG"], [win("3.1.4", "S", 38.2), win("3.0.0", "S", 36.9)], false, 0, null, "UNPLAYED", 7, "A slow, systemic fantasy RPG set inside one enormous castle and the forest growing through it."),
	game(8, "Low Orbit Diner", "Night Owl Co-op", 2024, ["Management", "Cozy"], [linux("1.1.0", 0.7)], false, 0, null, "UNPLAYED", 8, "Flip pancakes for astronauts on a station that is very slowly falling. Native Linux build."),
	game(9, "Cartographer", "Inkwell", 2022, ["Puzzle"], [win("1.0.3", "P", 0.4)], true, 6.1, 1, "PLAYING", 9, "Redraw the map and the world follows. Fold, cut and rotate the paper to open new paths."),
	game(10, "Static Bloom", "Halfstep", 2025, ["Rhythm"], [win("0.4.0", "P", 1.6, true)], false, 0, null, "UNPLAYED", 0, "A rhythm game played on a broken TV. Find the beat between the channels."),
	game(11, "Kiln", "Clayworks", 2023, ["Crafting", "Survival"], [win("1.6.0", "P", 5.3), linux("1.6.0", 5.1), mac("1.6.0", 5.2)], false, 33, 300, "ABORTED_TEMPORARY", 10, "Fire pottery, trade it downriver, keep the kiln burning through winter."),
	game(12, "Paper Lanterns", "Two Rivers", 2019, ["Narrative"], [win("1.0.0", "P", 1.9)], true, 9.4, 30, "COMPLETED", 11, "One night, one river festival, and the letters your grandmother never sent."),
];

const FOLDERS: Record<Platform, AppState["folders"]> = {
	macos: [
		{ path: "~/Games/Stault", freeBytes: 318 * GB },
		{ path: "/Volumes/Archive/Games", freeBytes: 1460 * GB },
	],
	windows: [
		{ path: "D:\\Games\\Stault", freeBytes: 612 * GB },
		{ path: "C:\\Users\\sam\\Games", freeBytes: 88 * GB },
	],
	linux: [
		{ path: "/home/deck/Games", freeBytes: 142 * GB },
		{ path: "/run/media/deck/sd", freeBytes: 390 * GB },
	],
};

export function createMockApi(): StaultApi {
	const platform = (params.get("platform") as Platform) ?? "windows";
	const handlers: { [K in keyof Pushes]?: (payload: Pushes[K]) => void } = {};
	const sep = platform === "windows" ? "\\" : "/";
	const session = {
		serverUrl: "https://vault.lan",
		serverVersion: "17.2.0",
		userId: 1,
		username: "sam",
	};

	// On an OS that can't run a build, the sample library has nothing installed.
	const installedHere = (g: (typeof seed)[number]) =>
		g.installed && canRun(platform, g.versions[0].type) !== "no";

	// One of each state, to look at: 2 is waiting to upload, 3 changed on two devices, 9 is unknown to Ludusavi.
	const SAVE_STATES: Record<number, SaveState> = { 2: "pending", 3: "conflict", 9: "unsupported" };
	const save = (gameId: number, state: SaveState = SAVE_STATES[gameId] ?? "idle"): AppState["saves"][number] => ({
		gameId,
		state,
		name: state === "unsupported" ? null : find(gameId).title,
		paths: null,
		syncedAt: state === "unsupported" || gameId === 12 ? null : ago(gameId / 4),
		...(state === "conflict"
			? { conflict: { serverAt: ago(0.2), serverDevice: "Steam Deck", localAt: ago(0.05) } }
			: {}),
	});

	let state: AppState = {
		platform,
		version: "0.5.0",
		ready: true,
		session: params.has("signedout") ? null : session,
		online: true,
		lastSignIn: params.has("signedout") ? { serverUrl: "https://vault.lan", username: "sam" } : null,
		deviceName: { macos: "MacBook Pro", windows: "Desktop PC", linux: "Steam Deck" }[platform],
		// Like the main process: a game whose default version can't run here comes with all its versions.
		games: seed.map(({ description: _d, installed: _i, versions, ...summary }) =>
			canRun(platform, summary.type, summary.version) === "no" ? { ...summary, versions } : summary,
		),
		gamesLoaded: true,
		installs: seed.filter(installedHere).map((g) => ({
			gameId: g.id,
			versionId: g.versions[0].id,
			version: g.versions[0].version,
			type: g.versions[0].type,
			path: `${FOLDERS[platform][0].path}${sep}${g.title}`,
			sizeBytes: g.versions[0].sizeBytes * 1.15,
			installedAt: ago(g.id),
		})),
		downloads: [],
		completed: seed
			.filter((g) => installedHere(g) && (g.id === 6 || g.id === 9))
			.map((g, i) => ({ gameId: g.id, title: g.title, at: ago(i), sizeBytes: g.versions[0].sizeBytes * 1.15 })),
		running: null,
		folders: FOLDERS[platform],
		speedLimitKib: 0,
		saves: seed.filter(installedHere).map((g) => save(g.id)),
		saveSync: { enabled: true, serverOff: params.has("savesoff") },
	};

	const patch = (p: Partial<AppState>) => {
		state = { ...state, ...p };
		handlers.patch?.(p);
	};
	const toast = (text: string, sub?: string) => handlers.toast?.({ text, sub });
	const later = <T,>(value: T, ms = 150) =>
		new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
	function find(gameId: number) {
		return seed.find((g) => g.id === gameId)!;
	}
	const setSave = (gameId: number, change: Partial<AppState["saves"][number]>) =>
		patch({ saves: state.saves.map((s) => (s.gameId === gameId ? { ...s, ...change } : s)) });
	const updateGame = (gameId: number, change: Partial<AppState["games"][number]>) =>
		patch({ games: state.games.map((g) => (g.id === gameId ? { ...g, ...change } : g)) });

	function enqueue(gameId: number, versionId: number, received = 0): Download {
		const g = find(gameId);
		const v = g.versions.find((x) => x.id === versionId) ?? g.versions[0];
		return {
			gameId,
			versionId: v.id,
			title: g.title,
			version: v.version,
			type: v.type,
			phase: "download",
			paused: false,
			receivedBytes: received * v.sizeBytes,
			totalBytes: v.sizeBytes,
			bytesPerSecond: 0,
			progress: received,
			error: null,
		};
	}

	if (canRun(platform, "WINDOWS_SETUP") !== "no" && state.session) {
		state.downloads = [enqueue(7, find(7).versions[0].id, 0.46)];
	}

	// Advance the first unpaused download, like the prototype's tick().
	setInterval(() => {
		const index = state.downloads.findIndex((d) => !d.paused);
		if (index < 0) return;
		const d = { ...state.downloads[index] };
		const speed = (state.speedLimitKib ? state.speedLimitKib * 1024 : 48.2 * 1024 ** 2) * 6;
		if (d.phase === "download") {
			d.bytesPerSecond = speed / 6;
			d.receivedBytes = Math.min(d.totalBytes, d.receivedBytes + speed / 2);
			d.progress = d.receivedBytes / d.totalBytes;
			if (d.progress >= 1) Object.assign(d, { phase: "extract", progress: 0, bytesPerSecond: 0 });
		} else {
			d.progress += 0.11;
			if (d.progress >= 1 && d.phase === "extract" && d.type === ("WINDOWS_SETUP" satisfies GameType)) {
				Object.assign(d, { phase: "setup", progress: 0 });
			}
		}
		if (d.progress >= 1 && d.phase !== "download") {
			const folder = state.folders[0].path;
			patch({
				downloads: state.downloads.filter((_, i) => i !== index),
				completed: [{ gameId: d.gameId, title: d.title, at: new Date().toISOString(), sizeBytes: d.totalBytes * 1.15 }, ...state.completed],
				installs: [...state.installs, { gameId: d.gameId, versionId: d.versionId, version: d.version, type: d.type, path: `${folder}${sep}${d.title}`, sizeBytes: d.totalBytes * 1.15, installedAt: new Date().toISOString() }],
				saves: [...state.saves.filter((s) => s.gameId !== d.gameId), save(d.gameId, "idle")],
			});
			toast(`${d.title} is ready to play`, `Installed to ${folder}`);
			return;
		}
		patch({ downloads: state.downloads.map((x, i) => (i === index ? d : x)) });
	}, 500);

	const editDownload = (gameId: number, change: Partial<Download>) =>
		patch({ downloads: state.downloads.map((d) => (d.gameId === gameId ? { ...d, ...change } : d)) });

	// Programs chosen by hand. Cartographer (9) has two, so Play asks until one is chosen.
	const chosen = new Map<number, string>();
	function executables(gameId: number) {
		const install = state.installs.find((i) => i.gameId === gameId);
		if (!install) throw new Error("This game isn't installed.");
		const name = find(gameId).title.replace(/\s+/g, "");
		const candidates = install.type.startsWith("LINUX")
			? ["start.sh", `tools${sep}config.sh`]
			: gameId === 9
				? [`${name}.exe`, `tools${sep}MapEditor.exe`]
				: [`${name}.exe`];
		const current = chosen.get(gameId) ?? (gameId === 9 && !params.has("picked") ? null : candidates[0]);
		if (current && !candidates.includes(current)) candidates.unshift(current);
		return { current, candidates };
	}
	function choose(gameId: number, path: string) {
		chosen.set(gameId, path);
		if (gameId === 9) params.set("picked", "1");
	}

	let cancelSso = () => {};

	return {
		onPush(type, handler) {
			handlers[type] = handler as never;
		},
		getState: () => later(state, 0),
		checkServer: ({ url }) =>
			later(/\S+\.\S+/.test(url) ? { ok: true, serverUrl: /^https?:/.test(url) ? url : `https://${url}`, version: "17.3.0", methods } : { ok: false, error: "No GameVault server answered at that address." }, 400),
		async signIn({ serverUrl, password, username }) {
			await later(null, 600);
			if (password === "wrong") throw new Error("Wrong username or password.");
			patch({ session: { ...session, serverUrl, username } });
		},
		async signInWithSso({ serverUrl }) {
			// Stands in for the browser: the user is back after four seconds, unless they cancel first.
			const signedIn = await new Promise<boolean>((resolve) => {
				cancelSso = () => resolve(false);
				setTimeout(() => resolve(true), 4000);
			});
			if (signedIn) patch({ session: { ...session, serverUrl } });
			return signedIn;
		},
		cancelSso: async () => cancelSso(),
		async signOut() {
			patch({ session: null });
		},
		refreshLibrary: () => later(undefined),
		getGame: ({ gameId }) => {
			const { installed: _i, ...detail } = find(gameId);
			return later({ ...detail, ...state.games.find((g) => g.id === gameId)! });
		},
		async install({ gameId, versionId }) {
			const d = enqueue(gameId, versionId);
			const wasIdle = !state.downloads.some((x) => !x.paused);
			patch({
				installs: state.installs.filter((i) => i.gameId !== gameId),
				downloads: [...state.downloads.filter((x) => x.gameId !== gameId), d],
			});
			toast(`${wasIdle ? "Downloading" : "Queued"} ${d.title}${d.version ? ` ${d.version}` : ""}`, "From vault.lan");
		},
		async setDownloadPaused({ gameId, paused }) {
			editDownload(gameId, { paused, bytesPerSecond: 0 });
		},
		async setAllDownloadsPaused({ paused }) {
			patch({ downloads: state.downloads.map((d) => ({ ...d, paused, bytesPerSecond: 0 })) });
		},
		async removeDownload({ gameId }) {
			patch({ downloads: state.downloads.filter((d) => d.gameId !== gameId) });
		},
		async moveDownloadUp({ gameId }) {
			const list = [...state.downloads];
			const i = list.findIndex((d) => d.gameId === gameId);
			if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
			patch({ downloads: list });
		},
		async uninstall({ gameId }) {
			patch({
				installs: state.installs.filter((i) => i.gameId !== gameId),
				completed: state.completed.filter((c) => c.gameId !== gameId),
				saves: state.saves.filter((s) => s.gameId !== gameId),
			});
		},
		async play({ gameId }) {
			if (gameId === 9 && !params.has("picked")) {
				return { status: "pick", candidates: ["Cartographer.exe", "tools/MapEditor.exe"] };
			}
			const saves = state.saves.find((s) => s.gameId === gameId);
			if (state.saveSync.enabled && !state.saveSync.serverOff && saves?.name && saves.state !== "off") {
				if (saves.state === "conflict") return { status: "save-conflict" };
				// The check for a newer save on the server, before the game starts.
				setSave(gameId, { state: "syncing" });
				await later(null, 1500);
				setSave(gameId, { state: saves.state });
			}
			patch({ running: { gameId, startedAt: new Date().toISOString() } });
			toast(`Launching ${find(gameId).title}`, "Playtime is tracked on the server");
			return { status: "started" };
		},
		async getExecutables({ gameId }) {
			await later(null, 300);
			return executables(gameId);
		},
		async setExecutable({ gameId, path }) {
			choose(gameId, path);
		},
		async browseExecutable({ gameId }) {
			// Stands in for the native picker: a program outside the game's folder.
			const path = `${state.folders[state.folders.length - 1].path}${sep}${find(gameId).title}${sep}Launcher.exe`;
			choose(gameId, path);
			return later(path, 300);
		},
		async stop({ gameId }) {
			const started = state.running ? new Date(state.running.startedAt).getTime() : Date.now();
			const g = state.games.find((x) => x.id === gameId)!;
			patch({ running: null });
			updateGame(gameId, {
				minutesPlayed: g.minutesPlayed + Math.max(1, Math.round((Date.now() - started) / 60_000)),
				lastPlayedAt: new Date().toISOString(),
				progressState: g.progressState === "UNPLAYED" ? "PLAYING" : g.progressState,
			});
		},
		async syncSaves({ gameId, direction }) {
			setSave(gameId, { state: "syncing" });
			await later(null, 700);
			setSave(gameId, { state: "idle", syncedAt: new Date().toISOString(), conflict: undefined });
			toast(`${find(gameId).title}: saves ${direction === "upload" ? "uploaded" : "restored"}`);
		},
		findSaveGames: ({ query }) =>
			later(
				seed.map((g) => g.title).filter((title) => title.toLowerCase().includes(query.trim().toLowerCase().slice(0, 4))),
				300,
			),
		async setSaveGame({ gameId, name }) {
			setSave(gameId, { name, paths: null, state: "idle", syncedAt: null, conflict: undefined });
		},
		async setGameSaveSync({ gameId, on }) {
			const name = state.saves.find((s) => s.gameId === gameId)?.name;
			setSave(gameId, { state: !on ? "off" : name ? "idle" : "unsupported", conflict: undefined });
		},
		async setSavePaths({ gameId, paths }) {
			const kept = paths.map((path) => path.trim()).filter(Boolean);
			if (!kept.length) throw new Error("Add at least one save file or folder.");
			setSave(gameId, { name: find(gameId).title, paths: kept, state: "idle", syncedAt: null, conflict: undefined });
		},
		pickSavePath: ({ folder }) =>
			later(folder ? "<home>/Library/Application Support/Example" : "<home>/Documents/Example/save1.dat", 200),
		async setSaveSync({ on }) {
			patch({ saveSync: { ...state.saveSync, enabled: on } });
		},
		async addLibraryFolder() {
			patch({ folders: [...state.folders, { path: `${state.folders[0].path} ${state.folders.length + 1}`, freeBytes: 64 * GB }] });
		},
		async removeLibraryFolder({ path }) {
			patch({ folders: state.folders.filter((f) => f.path !== path) });
		},
		async setSpeedLimit({ kib }) {
			patch({ speedLimitKib: kib });
		},
		async setDeviceName({ name }) {
			patch({ deviceName: name });
		},
		async windowMinimize() {},
		async windowToggleMaximize() {},
		async windowClose() {},
	};
}
