import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { $, browser, expect } from "@wdio/globals";
import {
	confirm, dialog, footer, gameList, hero, install, installFolder, LIBRARY, listedGames, main, openGame, restart, runs,
	section, signIn, toast, toastGone,
} from "../app.ts";

const versions = () => $("section[aria-labelledby='h-ver']");
/** Whether Tin Kettle's start script is running. */
const gameRuns = () => runs("files/start.sh");
const installed = (version: string) =>
	expect(main()).toHaveText(`Installed · ${version}`, { containing: true, ignoreCase: true, wait: 30_000 });

describe("Installing, playing and uninstalling a game", () => {
	before(signIn);

	it("downloads Tin Kettle and says when it is ready", async () => {
		await openGame("Tin Kettle");
		await hero("Install").click();
		await expect(dialog()).toHaveText(expect.stringContaining(LIBRARY));
		await confirm("Install");
		await expect(toast()).toHaveText(expect.stringContaining("Tin Kettle"));
		await hero("Play").waitForExist({ timeout: 30_000 });
		await expect(footer()).toHaveText(expect.stringContaining("No downloads"));
	});

	it("puts the game into the library folder, with a note of what it is", () => {
		const folder = installFolder("Tin Kettle", readdirSync(LIBRARY));
		expect(existsSync(join(folder, "files", "start.sh"))).toBe(true);
		const manifest = JSON.parse(readFileSync(join(folder, ".stault", "manifest.json"), "utf8"));
		expect(manifest.title).toBe("Tin Kettle");
		expect(manifest.type).toBe("LINUX_PORTABLE");
		// The download's own files are gone once the game is installed.
		expect(existsSync(join(folder, ".stault", "download"))).toBe(false);
	});

	it("shows the install on the game's page", async () => {
		await installed("v1.1.0");
		await expect(main()).toHaveText(expect.stringContaining(installFolder("Tin Kettle", readdirSync(LIBRARY))));
		await expect(versions()).toHaveText(expect.stringContaining("INSTALLED"));
		await expect(main().$("button=Uninstall…")).toExist();
	});

	it("shows it everywhere else too", async () => {
		await gameList().$("button*=Installed · 1").click();
		expect(await listedGames()).toEqual(["Tin Kettle"]);
		await gameList().$("button*=All ·").click();

		await section("Downloads").click();
		await expect($("section[aria-labelledby='h-done']")).toHaveText(expect.stringContaining("Tin Kettle"));

		await section("Library").click();
		await expect($("section[aria-labelledby='h-cont']")).toHaveText("Tin Kettle", { containing: true, ignoreCase: true });
	});

	it("starts the game", async () => {
		await openGame("Tin Kettle");
		await hero("Play").click();
		await expect(hero("Stop")).toHaveText(expect.stringContaining("Playing · 0 min"));
		await browser.waitUntil(gameRuns);
		await expect(main()).toHaveText(expect.stringMatching(/PROGRESS\s*Playing/));
		await expect(gameList().$("button*=Tin Kettle")).toHaveText(expect.stringContaining("Playing now"));
		// A running game can't be uninstalled.
		await expect(main().$("button=Uninstall…")).not.toExist();
	});

	it("stops the game", async () => {
		await hero("Stop").click();
		await hero("Play").waitForExist();
		await browser.waitUntil(() => !gameRuns());
	});

	it("asks before uninstalling, and keeps the game on Cancel", async () => {
		await main().$("button=Uninstall…").click();
		await expect(dialog().$("h2")).toHaveText("Uninstall Tin Kettle?", { ignoreCase: true });
		await dialog().$("button=Cancel").click();
		await expect(dialog()).not.toExist();
		await expect(hero("Play")).toExist();
	});

	it("uninstalls from the game's menu and deletes its files", async () => {
		await gameList().$("button*=Tin Kettle").click({ button: "right" });
		await $("[role=menu]").$("button*=Uninstall").click();
		await dialog().$("button=Uninstall").click();
		await expect(toast()).toHaveText(expect.stringContaining("Tin Kettle uninstalled"));
		await hero("Install").waitForExist();
		expect(readdirSync(LIBRARY).filter((entry) => entry.startsWith("Tin Kettle"))).toEqual([]);
	});

	it("installs the version that was asked for", async () => {
		await openGame("Pixel Drift");
		await toastGone();
		await versions().$$("button=Install")[1].click();
		await confirm("Install");
		await installed("v1.1.0");
	});

	it("switches to another version", async () => {
		await toastGone();
		await versions().$("button=Switch").click();
		await expect(dialog()).toHaveText(expect.stringContaining("SWITCH VERSION"));
		await confirm("Switch version");
		await installed("v1.2.0");
	});

	it("keeps its installs when the app starts again", async () => {
		await install("Tin Kettle");
		await restart();
		await gameList().$("button*=Installed · 2").waitForExist();
	});
});
