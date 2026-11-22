// End-to-end tests: WebdriverIO starts the built app and drives its real
// window, against the test server from ./dev/seed.sh. CONTRIBUTING.md says
// how to run them.
//
//   STAULT_APP     the built app's launcher, <app>/bin/launcher (launcher.exe on Windows)
//   STAULT_SERVER  the test server's address, where it is not the one in dev/seed.sh

import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browser } from "@wdio/globals";

// The app keeps everything under the home folder set below. Without a keyring
// its sign-in token goes into a file there too, not into the desktop's keyring.
for (const name of ["XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME"]) {
	delete process.env[name];
}
process.env.DBUS_SESSION_BUS_ADDRESS = "unix:path=/nonexistent";

export const config: WebdriverIO.Config = {
	runner: "local",
	specs: ["./specs/**/*.e2e.ts"],
	// One app at a time: the specs share the test server's one account.
	maxInstances: 1,
	services: ["electrobun"],
	capabilities: [
		{
			browserName: "electrobun",
			"wdio:electrobunServiceOptions": { appBinaryPath: process.env.STAULT_APP },
		},
	],
	// Every spec file starts its own app in an empty home folder: nobody signed
	// in, nothing installed. Linux reads it from HOME, Windows from USERPROFILE.
	onWorkerStart() {
		const home = mkdtempSync(join(tmpdir(), "stault-e2e-home-"));
		process.env.HOME = home;
		process.env.USERPROFILE = home;
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
