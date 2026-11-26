// End-to-end tests: WebdriverIO starts the built app and drives its real
// window, against the test server from ./dev/seed.sh. CONTRIBUTING.md says
// how to run them.
//
//   STAULT_APP     the built app's launcher, <app>/bin/launcher (launcher.exe on Windows)

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browser } from "@wdio/globals";
import { DEBUG_PORT, startApp, stopApp, webView2Version } from "./windows.ts";

const WINDOWS = process.platform === "win32";

// On Linux the app keeps everything under the home folder set below. Without a
// keyring its sign-in token goes into a file there too, not into the desktop's keyring.
for (const name of ["XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME"]) {
	delete process.env[name];
}
process.env.DBUS_SESSION_BUS_ADDRESS = "unix:path=/nonexistent";

export const config: WebdriverIO.Config = {
	runner: "local",
	specs: ["./specs/**/*.e2e.ts"],
	// One app at a time: the specs share the test server's one account.
	maxInstances: 1,
	// Linux: the Electrobun service starts the app through WebKit's WebDriver.
	// Windows: the tests start it (windows.ts) and Edge's WebDriver attaches to it.
	services: WINDOWS ? [] : ["electrobun"],
	capabilities: [
		WINDOWS
			? {
					browserName: "MicrosoftEdge",
					browserVersion: webView2Version(),
					"ms:edgeOptions": { debuggerAddress: `127.0.0.1:${DEBUG_PORT}` },
					// Over WebDriver BiDi, Edge's WebDriver adds a page of its own to
					// the webview, and the session lands on a blank page instead of the app's.
					"wdio:enforceWebDriverClassic": true,
				}
			: {
					browserName: "electrobun",
					"wdio:electrobunServiceOptions": { appBinaryPath: process.env.STAULT_APP },
				},
	],
	// Every spec file starts its own app in an empty home folder: nobody signed
	// in, nothing installed. Linux reads it from HOME; Windows from USERPROFILE,
	// and the app keeps its data in LOCALAPPDATA.
	onWorkerStart() {
		const home = mkdtempSync(join(tmpdir(), "stault-e2e-home-"));
		process.env.HOME = home;
		process.env.USERPROFILE = home;
		process.env.LOCALAPPDATA = join(home, "AppData", "Local");
		mkdirSync(process.env.LOCALAPPDATA, { recursive: true });
		if (!WINDOWS) useCurlAsBrowser(home);
	},
	async beforeSession() {
		if (WINDOWS) await startApp();
	},
	afterSession() {
		if (WINDOWS) stopApp();
	},
	// A picture of the window for every check that fails, in e2e/failures/.
	async afterTest(test, _context, { passed }) {
		if (passed) return;
		mkdirSync("failures", { recursive: true });
		const name = `${test.parent} - ${test.title}`.replace(/[^\w .-]/g, "_");
		await browser.saveScreenshot(join("failures", `${name}.png`)).catch(() => {});
	},
	// How long a check waits for the window to catch up.
	waitforTimeout: 10_000,
	logLevel: "warn",
	framework: "mocha",
	reporters: ["spec"],
	mochaOpts: { ui: "bdd", timeout: 60_000 },
};

/**
 * Makes curl the web browser in a Linux home folder: single sign-on opens one,
 * and the test server's identity provider signs the test account in by
 * itself, so all a browser does there is follow redirects, with cookies. On
 * Windows, e2e.yml does the same for the runner's account.
 */
function useCurlAsBrowser(home: string) {
	const apps = join(home, ".local", "share", "applications");
	mkdirSync(apps, { recursive: true });
	writeFileSync(
		join(apps, "curl-browser.desktop"),
		'[Desktop Entry]\nType=Application\nName=curl\nExec=curl -fsSL -b "" -o /dev/null %u\nMimeType=x-scheme-handler/http;x-scheme-handler/https;\n',
	);
	mkdirSync(join(home, ".config"), { recursive: true });
	writeFileSync(
		join(home, ".config", "mimeapps.list"),
		"[Default Applications]\nx-scheme-handler/http=curl-browser.desktop\nx-scheme-handler/https=curl-browser.desktop\n",
	);
}
