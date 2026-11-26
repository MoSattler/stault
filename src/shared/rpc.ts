import type { RPCSchema } from "electrobun/view";
import type {
	AppState,
	Executables,
	GameDetail,
	PlayResult,
	ServerCheck,
	Toast,
} from "./model";

type Req<P, R = void> = { params: P; response: R };

/** Requests the UI makes of the main process. */
export type Requests = {
	getState: Req<{}, AppState>;
	checkServer: Req<{ url: string }, ServerCheck>;
	signIn: Req<{
		serverUrl: string;
		username: string;
		password: string;
	}>;
	/**
	 * Opens the server's login page in the system browser and waits for the
	 * user. True once signed in, false after `cancelSso`.
	 */
	signInWithSso: Req<{ serverUrl: string }, boolean>;
	cancelSso: Req<{}>;
	signOut: Req<{}>;
	refreshLibrary: Req<{}>;
	getGame: Req<{ gameId: number }, GameDetail>;
	install: Req<{ gameId: number; versionId: number; folder: string }>;
	setDownloadPaused: Req<{ gameId: number; paused: boolean }>;
	setAllDownloadsPaused: Req<{ paused: boolean }>;
	removeDownload: Req<{ gameId: number }>;
	moveDownloadUp: Req<{ gameId: number }>;
	uninstall: Req<{ gameId: number }>;
	play: Req<{ gameId: number }, PlayResult>;
	/** The programs that could start an installed game. Changes nothing. */
	getExecutables: Req<{ gameId: number }, Executables>;
	setExecutable: Req<{ gameId: number; path: string }>;
	/** Opens the native file picker in the game's folder and sets the chosen program. Null when cancelled. */
	browseExecutable: Req<{ gameId: number }, string | null>;
	stop: Req<{ gameId: number }>;
	/** Sends this device's saves to the server, or replaces them with the server's. */
	syncSaves: Req<{ gameId: number; direction: "upload" | "download" }>;
	/** Ludusavi entries whose name resembles the query, best first. */
	findSaveGames: Req<{ gameId: number; query: string }, string[]>;
	/** Sets which Ludusavi entry a game's saves follow. */
	setSaveGame: Req<{ gameId: number; name: string }>;
	/** Makes a game's saves the files and folders the user named, in place of a Ludusavi entry. */
	setSavePaths: Req<{ gameId: number; paths: string[] }>;
	/** Opens the native picker for a save file or folder; null when cancelled. */
	pickSavePath: Req<{ gameId: number; folder: boolean }, string | null>;
	/** Save sync for every game. */
	setSaveSync: Req<{ on: boolean }>;
	/** Save sync for one game, within the setting for every game. */
	setGameSaveSync: Req<{ gameId: number; on: boolean }>;
	/** Opens the native folder picker. Resolves once the folder is added or the picker is cancelled. */
	addLibraryFolder: Req<{}>;
	removeLibraryFolder: Req<{ path: string }>;
	setSpeedLimit: Req<{ kib: number }>;
	setDeviceName: Req<{ name: string }>;
	windowMinimize: Req<{}>;
	windowToggleMaximize: Req<{}>;
	windowClose: Req<{}>;
};

/** One-way messages the main process pushes to the UI. */
export type Pushes = {
	patch: Partial<AppState>;
	toast: Omit<Toast, "id">;
};

export type AppRPC = {
	bun: RPCSchema<{ requests: Requests; messages: {} }>;
	webview: RPCSchema<{ requests: {}; messages: Pushes }>;
};
