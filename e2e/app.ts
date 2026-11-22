// What the specs share: the test server's account, where the app keeps its
// files, and the parts of the window every spec reaches for.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { $, browser } from "@wdio/globals";
import { startApp } from "./windows.ts";

const seed = readFileSync(join(import.meta.dirname, "..", "dev", "seed.sh"), "utf8");
const read = (name: string) => seed.match(new RegExp(`^${name}=(.*)$`, "m"))![1];

/** STAULT_SERVER overrides the address where the server goes by another name, as inside a container. */
export const SERVER = process.env.STAULT_SERVER ?? read("SERVER");
export const USER = read("DEV_USER");
export const PASSWORD = read("DEV_PASSWORD");

const WINDOWS = process.platform === "win32";

/** The home folder of the app under test. Each spec file gets a new, empty one (wdio.conf.ts). */
export const HOME = homedir();
/** The default library folder. A game is installed into "<Title> [<id>]" in it. */
export const LIBRARY = join(HOME, "Games", "Stault");
/** A file in the app's data folder, such as settings.json. */
export const dataFile = (name: string) =>
	join(WINDOWS ? process.env.LOCALAPPDATA! : join(HOME, ".local", "share"), "com.mosattler.stault", "dev", name);

/** How the app names this system, as in its footer. */
export const SYSTEM = WINDOWS ? "Windows" : "Linux";

/**
 * A small sample game made for this system, with one version: the file in its
 * folder that starts it, and what runs() looks for while it plays.
 */
export const NATIVE = WINDOWS
	? { title: "Copper Kite", version: "v1.0.0", type: "WINDOWS_PORTABLE", program: "Kite.exe", process: "Kite.exe" }
	: { title: "Tin Kettle", version: "v1.1.0", type: "LINUX_PORTABLE", program: "start.sh", process: "files/start.sh" };

/** What runs() looks for while the app under test is open. */
const APP = WINDOWS ? "launcher.exe" : "bin/launcher --automation";

export const main = () => $("main");
export const gameList = () => $("aside[aria-label='Game list']");
export const dialog = () => $("dialog[open]");
export const toast = () => $("div[aria-live='polite']");
export const footer = () => $("footer");
/** "Library" or "Downloads" in the title bar. */
export const section = (name: string) => $("nav[aria-label='Sections']").$(`button*=${name}`);

/** The big button on a game's page, by how its label starts: "Install", "Play", "Stop", "Downloading". */
export const hero = (label: string) =>
	main().$(`.//button[span/span[1][starts-with(normalize-space(), "${label}")]]`);

/**
 * The titles in the list on the left, top to bottom. Read from the page,
 * because WebKit's WebDriver reports no text for a line that CSS may cut short.
 */
export const listedGames = () =>
	browser.execute(() =>
		[...document.querySelectorAll("aside[aria-label='Game list'] li button")].map(
			(row) => row.lastElementChild!.firstElementChild!.textContent!,
		),
	);

/**
 * Replaces a field's text the way a user does: select all of it, then type.
 * WebDriver's own way of emptying a field goes unnoticed by the page, which
 * then puts the old text back.
 */
export async function fill(field: ReturnType<typeof $>, text: string) {
	await field.click();
	await browser.keys(["Control", "a"]);
	if (text) await field.addValue(text);
	else await browser.keys("Backspace");
}

/** Signs in on the Connect screen and waits for the library and its games. */
export async function signIn() {
	await fill($("#srv"), SERVER);
	await fill($("#usr"), USER);
	await fill($("#pwd"), PASSWORD);
	await $("button[type=submit]").click();
	await gameList().waitForDisplayed();
	await browser.waitUntil(async () => (await listedGames()).length > 0);
}

/**
 * Whether a program is running: on Linux one whose command line holds this
 * text, on Windows one whose file has this name.
 */
export function runs(program: string) {
	if (WINDOWS) {
		const tasks = execFileSync("tasklist", ["/fo", "csv", "/nh", "/fi", `IMAGENAME eq ${program}`], { encoding: "utf8" });
		return tasks.includes(`"${program}"`);
	}
	try {
		execFileSync("pgrep", ["-f", program]);
		return true;
	} catch {
		return false;
	}
}

/**
 * Closes the app with its own Close button and starts it again on the same
 * home folder. Ending only the WebDriver session would leave the app running,
 * and a second copy hands over to the first. On Linux the new session starts
 * the app; on Windows the tests do (windows.ts).
 */
export async function restart() {
	await $("button[aria-label='Close']").click();
	await browser.waitUntil(() => !runs(APP));
	if (WINDOWS) await startApp();
	await browser.reloadSession();
}

/** Opens a game's page from the list on the left. */
export async function openGame(title: string) {
	await gameList().$(`button*=${title}`).click();
	await main().$(`h1*=${title}`).waitForExist();
}

/** Opens Settings on one of its tabs: "Library folders", "Downloads", "Saves", "Account". */
export async function openSettings(tab: string) {
	await $("button[aria-label='Settings']").click();
	await $("nav[aria-label='Settings sections']").$(`button=${tab}`).click();
}

/** Presses a dialog's main button, once the dialog has loaded what it needs and enabled it. */
export async function confirm(label: string) {
	const button = dialog().$(`button=${label}`);
	await button.waitForEnabled();
	await button.click();
}

/** Waits until no toast is showing. A toast covers the bottom right corner of the page for a few seconds. */
export const toastGone = () => toast().waitForExist({ reverse: true });

/** Installs a game's default version from its page and waits until it can be played. */
export async function install(title: string) {
	await openGame(title);
	await hero("Install").click();
	await confirm("Install");
	await hero("Play").waitForExist({ timeout: 30_000 });
	await toastGone();
}

/** The folder a game was installed into. */
export function installFolder(title: string, entries: string[]) {
	const name = entries.find((entry) => entry.startsWith(`${title} [`));
	if (!name) throw new Error(`${title} is not in ${LIBRARY}`);
	return join(LIBRARY, name);
}
