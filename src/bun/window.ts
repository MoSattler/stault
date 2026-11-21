import { randomUUID } from "node:crypto";
import { ApplicationMenu, BrowserView, BrowserWindow } from "electrobun/main";
import type { ApiTokens } from "./gamevault/types";
import { ssoLoginUrl, watchForTokens } from "./sso";

/** The design's minimum: still fits half of a 1080p screen. */
const MIN_WIDTH = 940;
const MIN_HEIGHT = 600;

type Rpc = NonNullable<ConstructorParameters<typeof BrowserWindow>[0]>["rpc"];

export function createMainWindow(url: string, rpc: Rpc) {
	// Without an Edit menu, macOS has no copy/paste/undo shortcuts in text fields.
	ApplicationMenu.setApplicationMenu([
		{
			label: "Stault",
			submenu: [
				{ role: "hide" },
				{ role: "hideOthers" },
				{ role: "showAll" },
				{ type: "separator" },
				{ role: "quit" },
			],
		},
		{
			label: "Edit",
			submenu: [
				{ role: "undo" },
				{ role: "redo" },
				{ type: "separator" },
				{ role: "cut" },
				{ role: "copy" },
				{ role: "paste" },
				{ role: "selectAll" },
			],
		},
		{
			label: "Window",
			submenu: [
				{ role: "minimize" },
				{ role: "zoom" },
				{ role: "toggleFullScreen" },
				{ role: "close" },
			],
		},
	]);

	const win = new BrowserWindow({
		title: "Stault",
		url,
		rpc,
		frame: { width: 1280, height: 800 },
		// macOS keeps its traffic lights over our own title bar; Windows and Linux
		// get no system title bar at all and Stault draws the window buttons.
		titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
	});
	win.center();

	// Electrobun has no minimum-size option, so push the window back out.
	win.on("resize", (event) => {
		const { width, height } = (event as { data: { width: number; height: number } }).data;
		if (width < MIN_WIDTH || height < MIN_HEIGHT) {
			win.setSize(Math.max(width, MIN_WIDTH), Math.max(height, MIN_HEIGHT));
		}
	});

	// The login window is no use without this one, and would keep the app running.
	win.on("close", () => loginWindow?.close());

	return win;
}

let loginWindow: BrowserWindow | null = null;

/**
 * Shows the server's single sign-on page in a window of its own. Resolves
 * with the tokens the server hands over at the end, or with null when the
 * user closes the window first.
 */
export function ssoLogin(serverUrl: string): Promise<ApiTokens | null> {
	loginWindow?.close();
	return new Promise((resolve) => {
		const frame = { width: 520, height: 720 };
		const win = new BrowserWindow({
			title: `Sign in to ${new URL(serverUrl).host}`,
			url: null,
			frame,
		});
		loginWindow = win;
		win.on("close", () => {
			if (loginWindow === win) loginWindow = null;
			resolve(null);
		});

		// These pages come from the server and its identity provider. They get no
		// way to call into Stault, and storage of their own that goes with the
		// window, so the next sign-in starts signed out.
		const view = new BrowserView({
			url: ssoLoginUrl(serverUrl),
			windowId: win.id,
			partition: `sso-${randomUUID()}`,
			sandbox: true,
			frame: { x: 0, y: 0, ...frame },
		});
		const tokensIn = watchForTokens(serverUrl);
		// "will-navigate" comes first, before anything is loaded. Only the macOS
		// build has been run, so the later event backs it up elsewhere.
		for (const name of ["will-navigate", "did-commit-navigation"] as const) {
			view.on(name, (event) => {
				const tokens = tokensIn(addressIn(event));
				if (!tokens) return;
				resolve(tokens);
				win.close();
			});
		}
	});
}

/**
 * The address a navigation event is about. Electrobun sends it bare, except
 * in "will-navigate", where it is JSON: {"url": "…", "allowed": true}.
 */
function addressIn(event: unknown): string {
	const { detail } = (event as { data: { detail: string } }).data;
	try {
		return (JSON.parse(detail) as { url?: string }).url ?? detail;
	} catch {
		return detail;
	}
}
