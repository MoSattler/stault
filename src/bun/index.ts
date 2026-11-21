import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { BrowserView, Updater, Utils } from "electrobun/main";
import type { AppRPC } from "../shared/rpc";
import { describeFolders } from "./folders";
import { Library } from "./library";
import { MediaProxy } from "./media";
import { createSecretStore } from "./secrets";
import { Session } from "./session";
import { SettingsFile } from "./settings";
import { connectSink, getState, patchState } from "./state";
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
console.log(`Data folder: ${dataDir}`);
const settings = new SettingsFile(join(dataDir, "settings.json"), {
	account: null,
	deviceName: hostname().replace(/\.local$/, ""),
	libraryFolders: [join(homedir(), "Games", "Stault")],
	speedLimitKib: 0,
});
const media = new MediaProxy(join(Utils.paths.userCache, "media"));
const library = new Library(join(dataDir, "library.json"), media);
const session = new Session(
	settings,
	createSecretStore(join(dataDir, "session.json")),
	media,
	library,
);

async function refreshFolders() {
	patchState({ folders: await describeFolders(settings.get().libraryFolders) });
}

patchState({
	deviceName: settings.get().deviceName,
	speedLimitKib: settings.get().speedLimitKib,
});

const notYet = () => {
	throw new Error("Not available yet.");
};

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
			install: notYet,
			setDownloadPaused: notYet,
			setAllDownloadsPaused: notYet,
			removeDownload: notYet,
			moveDownloadUp: notYet,
			uninstall: notYet,
			play: notYet,
			setExecutable: notYet,
			stop: notYet,
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
				await refreshFolders();
			},
			removeLibraryFolder: async ({ path }) => {
				const folders = settings.get().libraryFolders.filter((f) => f !== path);
				if (!folders.length) throw new Error("Keep at least one library folder.");
				settings.update({ libraryFolders: folders });
				await refreshFolders();
			},
			setSpeedLimit: ({ kib }) => {
				settings.update({ speedLimitKib: kib });
				patchState({ speedLimitKib: kib });
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
connectSink({
	patch: (patch) => rpc.send.patch(patch),
	toast: (toast) => rpc.send.toast(toast),
});

await refreshFolders();
await session.restore();
