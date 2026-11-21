import type { Pushes, Requests } from "../../shared/rpc";

/**
 * The only way the UI reaches the main process. Two implementations:
 * `rpc` inside the app, `mock` when the UI runs in a plain browser.
 */
export type StaultApi = {
	[K in keyof Requests]: (
		params: Requests[K]["params"],
	) => Promise<Requests[K]["response"]>;
} & {
	onPush<K extends keyof Pushes>(
		type: K,
		handler: (payload: Pushes[K]) => void,
	): void;
};

/** True inside the Electrobun webview (its preload sets this before any page script). */
export const inApp = "__electrobunWebviewId" in window;

export const api: StaultApi = inApp
	? (await import("./rpc")).createRpcApi()
	: (await import("./mock")).createMockApi();
