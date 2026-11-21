import type { AppState, Platform, Toast } from "../shared/model";

const platform: Platform =
	process.platform === "darwin"
		? "macos"
		: process.platform === "win32"
			? "windows"
			: "linux";

let state: AppState = {
	platform,
	ready: false,
	session: null,
	online: true,
	lastSignIn: null,
	deviceName: "",
	games: [],
	gamesLoaded: false,
	installs: [],
	downloads: [],
	completed: [],
	running: null,
	folders: [],
	speedLimitKib: 0,
	saves: [],
	saveSync: { enabled: true, serverOff: false },
};

type Sink = {
	patch(patch: Partial<AppState>): void;
	toast(toast: Omit<Toast, "id">): void;
};
let sink: Sink | null = null;

/** Connects the state to the webview. Until then, changes just accumulate. */
export function connectSink(next: Sink) {
	sink = next;
}

export const getState = () => state;

/** The one way state changes: update it here and tell the UI. */
export function patchState(patch: Partial<AppState>) {
	state = { ...state, ...patch };
	sink?.patch(patch);
}

export function toast(text: string, sub?: string) {
	sink?.toast({ text, sub });
}
