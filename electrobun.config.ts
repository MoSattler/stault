import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "Stault",
		identifier: "com.mosattler.stault",
		version: "0.0.1",
	},
	build: {
		mainProcess: "bun",
		bun: {
			entrypoint: "src/bun/index.ts",
		},
		// Vite builds the webview into dist/; Hutch copies it into the bundle.
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
		},
		// Vite owns dist/, so it must not retrigger the watch loop.
		watchIgnore: ["dist/**"],
		// Use the system webview on every platform (no bundled Chromium).
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;
