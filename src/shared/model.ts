// View models shared by the main process and the webview. Types only.

export type Platform = "macos" | "windows" | "linux";

export type GameType =
	| "UNDETECTABLE"
	| "WINDOWS_SETUP"
	| "WINDOWS_PORTABLE"
	| "WINDOWS_SOFTWARE"
	| "LINUX_PORTABLE"
	| "LINUX_SOFTWARE";

export type ProgressState =
	| "UNPLAYED"
	| "INFINITE"
	| "PLAYING"
	| "COMPLETED"
	| "ABORTED_TEMPORARY"
	| "ABORTED_PERMANENT";

export interface GameVersion {
	id: number;
	/** Version label from the server, e.g. "v1.4.2". Null when the file name has none. */
	version: string | null;
	type: GameType;
	sizeBytes: number;
	earlyAccess: boolean;
}

export interface GameSummary {
	id: number;
	title: string;
	sortTitle: string;
	/** Ready-to-use image URLs (already routed through the media proxy), or null. */
	coverUrl: string | null;
	backgroundUrl: string | null;
	genres: string[];
	developers: string[];
	releaseYear: number | null;
	/** ISO timestamp of when the game landed on the server. */
	addedAt: string;
	/** The server's default version. The full list is on GameDetail. */
	version: string | null;
	type: GameType;
	sizeBytes: number;
	minutesPlayed: number;
	lastPlayedAt: string | null;
	progressState: ProgressState;
}

export interface GameDetail extends GameSummary {
	/** Every version on the server, default first. */
	versions: GameVersion[];
	/** Markdown from the server's metadata provider. */
	description: string | null;
	publishers: string[];
}

export interface Install {
	gameId: number;
	versionId: number;
	version: string | null;
	type: GameType;
	/** Folder that holds the game's files. */
	path: string;
	sizeBytes: number;
	installedAt: string;
}

export type DownloadPhase = "download" | "extract" | "setup";

export interface Download {
	gameId: number;
	versionId: number;
	title: string;
	version: string | null;
	type: GameType;
	phase: DownloadPhase;
	paused: boolean;
	receivedBytes: number;
	totalBytes: number;
	bytesPerSecond: number;
	/** Progress of the current phase, 0 to 1. */
	progress: number;
	error: string | null;
}

export interface CompletedInstall {
	gameId: number;
	title: string;
	at: string;
	sizeBytes: number;
}

export interface LibraryFolder {
	path: string;
	freeBytes: number | null;
}

export interface Session {
	serverUrl: string;
	serverVersion: string;
	userId: number;
	username: string;
}

export interface Running {
	gameId: number;
	startedAt: string;
}

export type SaveState =
	/** Not looked up yet. */
	| "unknown"
	/** The user turned sync off for this game. */
	| "off"
	/** Ludusavi knows no save location for this game, and none was chosen. */
	| "unsupported"
	/** Nothing is waiting: in step with the server, or nothing to sync yet. */
	| "idle"
	/** Saves on this device still have to reach the server. */
	| "pending"
	/** Saves changed here and on the server; the user has to choose. */
	| "conflict"
	| "syncing";

/** Both sides changed. What the user needs to see to choose one. */
export interface SaveConflict {
	/** ISO time the server's save was uploaded. */
	serverAt: string;
	/** The device that uploaded it, when it said so (the official client doesn't). */
	serverDevice: string | null;
	/** ISO time this device's saves were last changed, when it can be told. */
	localAt: string | null;
}

/** Where one installed game's saves stand. */
export interface SaveSync {
	gameId: number;
	state: SaveState;
	/** The Ludusavi entry this game was matched to. */
	name: string | null;
	/** Save files the user chose by hand instead of a Ludusavi entry. */
	paths: string[] | null;
	/** ISO time the save this device last synced was uploaded. */
	syncedAt: string | null;
	/** Present while the state is "conflict". */
	conflict?: SaveConflict;
}

export interface Toast {
	id: number;
	text: string;
	sub?: string;
}

/** Everything the UI renders. The main process owns it and pushes patches. */
export interface AppState {
	platform: Platform;
	/** The running Stault version, e.g. "0.5.0"; builds off the stable channel add it, e.g. "0.5.0 (canary)". */
	version: string;
	/** False until the main process has tried to restore a saved session. */
	ready: boolean;
	session: Session | null;
	/** False when the last server request failed to connect. */
	online: boolean;
	/** Last server and user that signed in here, to prefill the Connect screen. */
	lastSignIn: { serverUrl: string; username: string } | null;
	deviceName: string;
	games: GameSummary[];
	gamesLoaded: boolean;
	installs: Install[];
	downloads: Download[];
	completed: CompletedInstall[];
	running: Running | null;
	folders: LibraryFolder[];
	/** Download speed limit in KiB/s, 0 for unlimited. */
	speedLimitKib: number;
	/** One entry per installed game. */
	saves: SaveSync[];
	saveSync: {
		/** The user's setting. */
		enabled: boolean;
		/** True once the server has said that save files are switched off there. */
		serverOff: boolean;
	};
}

export interface ServerCheck {
	ok: boolean;
	/** The full address that answered, e.g. "http://nas.local:8080". */
	serverUrl?: string;
	version?: string;
	error?: string;
}

/** The programs that could start an installed game. Paths are relative to its files, or absolute. */
export interface Executables {
	/** What Play starts. Null when Stault would ask first. */
	current: string | null;
	/** Every program found in the game's files, best guess first, and the current one. */
	candidates: string[];
}

export type PlayResult =
	| { status: "started" }
	/** Several executables fit; the user has to choose one. */
	| { status: "pick"; candidates: string[] }
	/** Saves changed here and on the server; the user has to choose which to keep. */
	| { status: "save-conflict" };
