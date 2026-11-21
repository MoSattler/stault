import type { RPCSchema } from "electrobun/view";
import type {
	AppState,
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
	signOut: Req<{}>;
	refreshLibrary: Req<{}>;
	getGame: Req<{ gameId: number }, GameDetail>;
	setBookmark: Req<{ gameId: number; on: boolean }>;
	install: Req<{ gameId: number; versionId: number; folder: string }>;
	setDownloadPaused: Req<{ gameId: number; paused: boolean }>;
	setAllDownloadsPaused: Req<{ paused: boolean }>;
	removeDownload: Req<{ gameId: number }>;
	moveDownloadUp: Req<{ gameId: number }>;
	uninstall: Req<{ gameId: number }>;
	play: Req<{ gameId: number }, PlayResult>;
	setExecutable: Req<{ gameId: number; path: string }>;
	stop: Req<{ gameId: number }>;
	/** Sends this device's saves to the server, or replaces them with the server's. */
	syncSaves: Req<{ gameId: number; direction: "upload" | "download" }>;
	/** Ludusavi entries whose name resembles the query, best first. */
	findSaveGames: Req<{ gameId: number; query: string }, string[]>;
	/** Sets which Ludusavi entry a game's saves follow; null turns sync off for it. */
	setSaveGame: Req<{ gameId: number; name: string | null }>;
	setSaveSync: Req<{ on: boolean }>;
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
