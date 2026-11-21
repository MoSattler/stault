import type { ElectrobunConfig } from "electrobun";

// 7-Zip extracts downloaded games. Only this platform's binary goes in the bundle.
const sevenZipDir = `node_modules/7zip-bin-full/${
	{ darwin: "mac", win32: "win", linux: "linux" }[process.platform as "darwin" | "win32" | "linux"]
}/${process.arch}`;
const sevenZipFiles = process.platform === "win32" ? ["7z.exe", "7z.dll"] : ["7zz"];

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
			...Object.fromEntries(
				[...sevenZipFiles, "License.txt"].map((file) => [`${sevenZipDir}/${file}`, `7zip/${file}`]),
			),
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
