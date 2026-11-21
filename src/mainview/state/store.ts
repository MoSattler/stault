import { useSyncExternalStore } from "react";
import type { AppState, Toast } from "../../shared/model";
import { api } from "../api";

function createStore<T extends object>(initial: T) {
	let state = initial;
	const listeners = new Set<() => void>();
	return {
		get: () => state,
		set(patch: Partial<T>) {
			state = { ...state, ...patch };
			for (const listener of listeners) listener();
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

// --- App state: owned by the main process, mirrored here. ---

const app = createStore<AppState>({
	platform: "macos",
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
});

api.onPush("patch", (patch) => app.set(patch));
api.onPush("toast", (toast) => showToast(toast.text, toast.sub));
api.getState({}).then((state) => app.set(state));

export function useApp<T>(select: (state: AppState) => T): T {
	return useSyncExternalStore(app.subscribe, () => select(app.get()));
}

// --- UI state: lives only in the webview. ---

export type View =
	| { name: "home" }
	| { name: "game"; gameId: number }
	| { name: "downloads" }
	| { name: "settings" };

export type Sort = "added" | "name" | "played" | "size";

interface UiState {
	view: View;
	query: string;
	filter: "all" | "installed";
	sort: Sort;
	toast: Toast | null;
	/** Game whose install dialog is open, with an optional preselected version. */
	installing: { gameId: number; versionId?: number } | null;
	/** Game waiting for the user to choose one of several executables. */
	picking: { gameId: number; candidates: string[] } | null;
}

const ui = createStore<UiState>({
	view: { name: "home" },
	query: "",
	filter: "all",
	sort: "added",
	toast: null,
	installing: null,
	picking: null,
});

export function useUi<T>(select: (state: UiState) => T): T {
	return useSyncExternalStore(ui.subscribe, () => select(ui.get()));
}

export const setUi = ui.set;
export const go = (view: View) => ui.set({ view });

let toastId = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(text: string, sub?: string) {
	clearTimeout(toastTimer);
	ui.set({ toast: { id: ++toastId, text, sub } });
	toastTimer = setTimeout(() => ui.set({ toast: null }), 4200);
}

/** Runs an action and shows its error as a toast instead of an unhandled rejection. */
export async function attempt<T>(action: Promise<T>): Promise<T | undefined> {
	try {
		return await action;
	} catch (error) {
		showToast(error instanceof Error ? error.message : String(error));
		return undefined;
	}
}
