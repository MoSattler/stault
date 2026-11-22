import { homedir, hostname } from "node:os";
import { basename, join } from "node:path";
import { BrowserView, PATHS, Updater, Utils } from "electrobun/main";
import { canRun } from "../shared/compat";
import type { AppRPC } from "../shared/rpc";
import { Downloads } from "./downloads";
import { describeFolders, removeFolder } from "./folders";
import { Installs } from "./installs";
import { Launcher } from "./launcher";
import { Library } from "./library";
import { MediaProxy } from "./media";
import { Saves } from "./saves";
import { Ludusavi } from "./saves/ludusavi";
import { createSecretStore } from "./secrets";
import { Session } from "./session";
import { SettingsFile } from "./settings";
import { claimInstance } from "./single-instance";
import { connectSink, getState, patchState, toast } from "./state";
import { createMainWindow } from "./window";

const DEV_SERVER_URL = "http://localhost:5173";

// In dev builds, prefer the Vite dev server (`hutch run dev:hmr`) so the UI
// hot-reloads. Otherwise load the bundled view.
async function getMainViewUrl(): Promise<string> {
	if ((await Updater.localInfo.channel()) === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			// Dev server not running: fall through to the bundled view.
		}
	}
	return "views://mainview/index.html";
}

const dataDir = Utils.paths.userData;
const instance = await claimInstance(dataDir);
// Stault is already running: that copy comes to the front, this one is done.
if (!instance) process.exit(0);
/** Where per-game Wine prefixes live (Linux). */
const prefixesDir = join(dataDir, "prefixes");
console.log(`Data folder: ${dataDir}`);
const { platform } = getState();

// --- Services ---------------------------------------------------------------

const settings = new SettingsFile(join(dataDir, "settings.json"), {
	account: null,
	lastSignIn: null,
	deviceName: hostname().replace(/\.local$/, ""),
	libraryFolders: [join(homedir(), "Games", "Stault")],
	speedLimitKib: 0,
	saveSync: true,
});
const media = new MediaProxy(join(Utils.paths.userCache, "media"));
const library = new Library(join(dataDir, "library.json"), media);

const installs = new Installs((list) => {
	patchState({
		installs: list,
		// "Completed" on the Downloads page: the most recent installs.
		completed: [...list]
			.sort((a, b) => b.installedAt.localeCompare(a.installedAt))
			.slice(0, 8)
			.map((i) => ({
				gameId: i.gameId,
				title: installs.get(i.gameId)?.manifest.title ?? "",
				at: i.installedAt,
				sizeBytes: i.sizeBytes,
			})),
	});
	saves.publish();
});

const session: Session = new Session(
	settings,
	createSecretStore(join(dataDir, "session.json")),
	media,
	library,
	{
		signedIn(serverUrl) {
			installs.scan(settings.get().libraryFolders, serverUrl);
			downloads.start();
			for (const install of getState().installs) void launcher.flush(install.gameId);
			saves.reset();
			saves.catchUp();
		},
		async signingOut() {
			launcher.stopAll();
			await downloads.clear();
			installs.scan([], null);
		},
	},
);

const launcher = new Launcher({
	platform,
	installs,
	logsDir: join(Utils.paths.logs, "com.mosattler.stault", "launch"),
	prefixesDir,
	client: () => session.client,
	userId: () => session.userId,
	game: (gameId) => library.raw(gameId),
	progressState: (gameId) =>
		getState().games.find((g) => g.id === gameId)?.progressState ?? "UNPLAYED",
	onProgress: (gameId, progress) => library.applyProgress(gameId, progress),
	onRunning: (running) => patchState({ running }),
	notify: toast,
	beforePlay: (gameId) => saves.beforePlay(gameId),
	afterExit: (gameId) => saves.changed(gameId),
	async pickFile(startIn) {
		const [picked] = await Utils.openFileDialog({
			startingFolder: startIn,
			canChooseFiles: true,
			canChooseDirectory: false,
			allowsMultipleSelection: false,
		});
		return picked || null;
	},
});

const bundled = (...path: string[]) => join(PATHS.RESOURCES_FOLDER, "app", ...path);
const sevenZip = bundled("7zip", platform === "windows" ? "7z.exe" : "7zz");

const saves: Saves = new Saves({
	platform,
	ludusavi: new Ludusavi(
		bundled("ludusavi", platform === "windows" ? "ludusavi.exe" : "ludusavi"),
		join(dataDir, "ludusavi"),
		homedir(),
	),
	sevenZip,
	installs,
	home: homedir(),
	prefixesDir,
	enabled: () => settings.get().saveSync,
	deviceName: () => settings.get().deviceName,
	client: () => session.client,
	userId: () => session.userId,
	// The metadata provider's title is the game's proper name; the other comes from the file name.
	titles: (gameId) => {
		const game = library.raw(gameId);
		const names = [game?.metadata?.title, game?.title, installs.get(gameId)?.manifest.title];
		return [...new Set(names.filter((name): name is string => !!name))];
	},
	running: () => getState().running?.gameId ?? null,
	onChange: (list, serverOff) =>
		patchState({ saves: list, saveSync: { enabled: settings.get().saveSync, serverOff } }),
	notify: toast,
});

const downloads = new Downloads({
	queuePath: join(dataDir, "downloads.json"),
	sevenZip,
	installs,
	client: () => session.client,
	serverUrl: () => session.serverUrl,
	speedLimitKib: () => settings.get().speedLimitKib,
	runSetup: (item, extractedTo, installTo, signal) =>
		launcher.runSetup(item.gameId, extractedTo, installTo, signal),
	onChange: (list) => patchState({ downloads: list }),
	onInstalled: (item) => {
		toast(`${item.title} is ready to play`, `Installed to ${item.dir}`);
		void refreshFolders();
		// A fresh install picks up the saves the server already has.
		saves.changed(item.gameId);
	},
});

async function refreshFolders() {
	patchState({ folders: await describeFolders(settings.get().libraryFolders) });
}

/** Library folders changed: update free space and look for installs in them. */
async function foldersChanged() {
	await refreshFolders();
	installs.scan(settings.get().libraryFolders, getState().session?.serverUrl ?? null);
}

// --- Requests from the UI ---------------------------------------------------

async function install(gameId: number, versionId: number, folder: string) {
	if (!settings.get().libraryFolders.includes(folder)) {
		throw new Error("Choose one of your library folders.");
	}
	if (getState().running?.gameId === gameId) throw new Error("Stop the game first.");
	const detail = await library.detail(session.client, gameId);
	const version = detail.versions.find((v) => v.id === versionId);
	const file = library.raw(gameId)?.versions?.find((v) => v.id === versionId)?.file_path;
	if (!version || !file) throw new Error("That version is no longer on the server.");
	if (canRun(platform, version.type, version.version) === "no") {
		throw new Error("This build can't run on this device.");
	}
	// The server wraps single-file games (a lone .exe or .sh) in a tar on the way out.
	const fileName = /\.(exe|sh|appimage)$/i.test(file) ? `${basename(file)}.tar` : basename(file);
	const queued = getState().downloads.some((d) => !d.paused && !d.error);
	await downloads.enqueue(
		{
			gameId,
			versionId,
			title: detail.title,
			version: version.version,
			type: version.type,
			totalBytes: version.sizeBytes,
			fileName,
		},
		folder,
	);
	toast(
		`${queued ? "Queued" : "Downloading"} ${detail.title}${version.version ? ` ${version.version}` : ""}`,
		`From ${new URL(session.serverUrl).host}`,
	);
}

async function uninstall(gameId: number) {
	if (getState().running?.gameId === gameId) throw new Error("Stop the game first.");
	// Credit any playtime still waiting before its record goes with the files.
	await launcher.flush(gameId);
	await installs.remove(gameId);
	// On Linux a Windows game also has a Wine prefix, which may even hold the game itself.
	await removeFolder(join(prefixesDir, String(gameId)));
	await refreshFolders();
}

const channel = await Updater.localInfo.channel();
patchState({
	version: (await Updater.localInfo.version()) + (channel === "stable" ? "" : ` (${channel})`),
	lastSignIn: settings.get().lastSignIn,
	deviceName: settings.get().deviceName,
	speedLimitKib: settings.get().speedLimitKib,
	saveSync: { enabled: settings.get().saveSync, serverOff: false },
});

const rpc = BrowserView.defineRPC<AppRPC>({
	maxRequestTime: 30_000,
	handlers: {
		requests: {
			getState: () => getState(),
			checkServer: ({ url }) => session.check(url),
			signIn: (input) => session.signIn(input),
			signOut: () => session.signOut(),
			refreshLibrary: () => session.refreshLibrary(),
			getGame: ({ gameId }) => library.detail(session.client, gameId),
			setBookmark: ({ gameId, on }) => library.setBookmark(session.client, gameId, on),
			install: ({ gameId, versionId, folder }) => install(gameId, versionId, folder),
			setDownloadPaused: ({ gameId, paused }) => downloads.setPaused(gameId, paused),
			setAllDownloadsPaused: ({ paused }) => downloads.setAllPaused(paused),
			removeDownload: ({ gameId }) => downloads.remove(gameId),
			moveDownloadUp: ({ gameId }) => downloads.moveUp(gameId),
			uninstall: ({ gameId }) => uninstall(gameId),
			play: ({ gameId }) => launcher.play(gameId),
			setExecutable: ({ gameId, path }) => launcher.setExecutable(gameId, path),
			stop: ({ gameId }) => launcher.stop(gameId),
			syncSaves: async ({ gameId, direction }) => {
				await saves.sync(gameId, direction);
			},
			findSaveGames: ({ gameId, query }) => saves.search(gameId, query),
			setSaveGame: ({ gameId, name }) => saves.choose(gameId, name ? { name } : null),
			setSavePaths: ({ gameId, paths }) => saves.choose(gameId, { paths }),
			pickSavePath: async ({ gameId, folder }) => {
				const [picked] = await Utils.openFileDialog({
					startingFolder: homedir(),
					canChooseFiles: !folder,
					canChooseDirectory: folder,
					allowsMultipleSelection: false,
				});
				return picked ? saves.savePath(gameId, picked) : null;
			},
			setSaveSync: ({ on }) => {
				settings.update({ saveSync: on });
				saves.publish();
				if (on) saves.catchUp();
			},
			addLibraryFolder: async () => {
				const [picked] = await Utils.openFileDialog({
					startingFolder: homedir(),
					canChooseFiles: false,
					canChooseDirectory: true,
					allowsMultipleSelection: false,
				});
				const folders = settings.get().libraryFolders;
				if (!picked || folders.includes(picked)) return;
				settings.update({ libraryFolders: [...folders, picked] });
				await foldersChanged();
			},
			removeLibraryFolder: async ({ path }) => {
				const folders = settings.get().libraryFolders.filter((f) => f !== path);
				if (!folders.length) throw new Error("Keep at least one library folder.");
				if (getState().installs.some((i) => i.path.startsWith(path))) {
					throw new Error("Uninstall the games in this folder first.");
				}
				settings.update({ libraryFolders: folders });
				await foldersChanged();
			},
			setSpeedLimit: ({ kib }) => {
				settings.update({ speedLimitKib: kib });
				patchState({ speedLimitKib: kib });
				downloads.speedLimitChanged();
			},
			setDeviceName: ({ name }) => {
				const deviceName = name.trim();
				if (!deviceName) return;
				settings.update({ deviceName });
				patchState({ deviceName });
			},
			windowMinimize: () => win.minimize(),
			windowToggleMaximize: () => {
				if (win.isMaximized()) win.unmaximize();
				else win.maximize();
			},
			windowClose: () => win.close(),
		},
		messages: {},
	},
});

const win = createMainWindow(await getMainViewUrl(), rpc);
instance.onSecondLaunch(() => {
	if (win.isMinimized()) win.unminimize();
	win.focus();
});
connectSink({
	patch: (patch) => rpc.send.patch(patch),
	toast: (message) => rpc.send.toast(message),
});

await refreshFolders();
await session.restore();

// Keep the library current: retry every minute while the server is out of
// reach, otherwise look for new games every ten minutes.
let minutes = 0;
setInterval(async () => {
	minutes++;
	const state = getState();
	if (!state.session || (state.online && minutes % 10 !== 0)) return;
	await session.refreshLibrary().catch(() => {});
	if (getState().online) {
		for (const install of getState().installs) void launcher.flush(install.gameId);
		saves.catchUp();
	}
}, 60_000);
