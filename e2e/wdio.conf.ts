// End-to-end tests: WebdriverIO starts the built app and drives its real
// window, against the test server from ./dev/seed.sh. CONTRIBUTING.md says
// how to run them.
//
//   STAULT_APP     the built app's launcher, <app>/bin/launcher
//   STAULT_SERVER  the test server's address, where it is not the one in dev/seed.sh

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
	// in, nothing installed.
	onWorkerStart() {
		process.env.HOME = mkdtempSync(join(tmpdir(), "stault-e2e-home-"));
	},
	logLevel: "warn",
	framework: "mocha",
	reporters: ["spec"],
	mochaOpts: { ui: "bdd", timeout: 60_000 },
};
