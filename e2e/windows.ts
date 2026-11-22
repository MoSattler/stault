// On Windows the tests start the app themselves. The Electrobun service would
// give every launch a new data folder of its own choosing and can't start the
// app again, so a check across a restart couldn't be made. Here the app gets
// the spec's own folders (wdio.conf.ts), and Edge's WebDriver attaches to its
// WebView2 through a debug port.
//
// WebView2 opens that port when a machine policy asks it to (e2e.yml sets it,
// for bun.exe, the program that hosts the app's webview). It ignores the
// WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS variable and the per-user policy on
// the CI runner, where every process runs elevated.

import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

/** The port the WebView2 policy in e2e.yml opens. */
export const DEBUG_PORT = 9222;

let app: ChildProcess | undefined;

/**
 * The installed WebView2 runtime's version. Edge's WebDriver only attaches to
 * the version it was made for, so WebdriverIO fetches the matching one.
 */
export function webView2Version() {
	const key = String.raw`HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`;
	const found = execFileSync("reg", ["query", key, "/v", "pv"], { encoding: "utf8" }).match(/pv\s+REG_SZ\s+(\S+)/);
	if (!found) throw new Error("The WebView2 runtime is not installed.");
	return found[1];
}

/** The pages a webview shows on the debug port; none when nothing listens there. */
const pages = (): Promise<{ type: string }[]> =>
	fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)
		.then((response) => response.json())
		.catch(() => []);

/**
 * The app's logs, in the spec's home folder: what it prints, and the app.log
 * that Electrobun's native code writes into its working folder.
 */
const logs = () => [join(homedir(), "output.log"), join(homedir(), "app.log")];

/** Starts the app and waits until its page is there on the debug port. */
export async function startApp() {
	// The webview of an app closed a moment ago may still hold the port. One that
	// keeps holding it would have WebdriverIO attach to the wrong app.
	for (const deadline = Date.now() + 10_000; (await pages()).length; await sleep(250)) {
		if (Date.now() > deadline) throw new Error(`Another app holds debug port ${DEBUG_PORT}.`);
	}
	const output = openSync(logs()[0], "a");
	app = spawn(process.env.STAULT_APP!, [], { cwd: homedir(), stdio: ["ignore", output, output] });
	closeSync(output);
	for (const deadline = Date.now() + 30_000; Date.now() < deadline && app.exitCode === null; await sleep(250)) {
		const found = await pages();
		if (found.some((page) => page.type === "page")) {
			console.log("DEBUG targets before attaching", JSON.stringify(found));
			return;
		}
	}
	const ended = app.exitCode === null ? "" : ` It exited with ${app.exitCode}.`;
	const tails = logs()
		.filter((file) => existsSync(file))
		.map((file) => `${file}:\n${readFileSync(file, "utf8").trimEnd().split("\n").slice(-30).join("\n")}`);
	throw new Error([`The app did not open its page on debug port ${DEBUG_PORT}.${ended}`, ...tails].join("\n\n"));
}

/**
 * Points the WebDriver session at the app's own page, which Electrobun serves
 * from views://. The webview shows more than one page to WebDriver.
 */
export async function useAppPage(browser: WebdriverIO.Browser) {
	console.log("DEBUG targets", JSON.stringify(await pages()));
	for (const handle of await browser.getWindowHandles()) {
		await browser.switchToWindow(handle);
		console.log("DEBUG handle", handle, await browser.getUrl(), await browser.getTitle());
	}
	await browser.switchWindow(/^views:\/\//);
}

/** Ends the app, if it still runs, with everything it started. */
export function stopApp() {
	if (!app?.pid) return;
	try {
		execFileSync("taskkill", ["/pid", String(app.pid), "/t", "/f"], { stdio: "ignore" });
	} catch {
		// It had already ended.
	}
}
