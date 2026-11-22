import { readFileSync } from "node:fs";
import { $, browser, expect } from "@wdio/globals";
import { dataFile, fill, footer, install, LIBRARY, main, openGame, openSettings, restart, signIn } from "../app.ts";

const saved = () => JSON.parse(readFileSync(dataFile("settings.json"), "utf8"));
const syncSwitch = () => $("button[role=switch][aria-label='Sync game saves']");
const deviceName = () => $("input[aria-label='Device name']");

describe("Settings", () => {
	before(signIn);

	it("lists the library folder and its free space", async () => {
		await openSettings("Library folders");
		await expect(main()).toHaveText(expect.stringContaining(LIBRARY));
		await expect(main()).toHaveText(expect.stringMatching(/\d+(\.\d+)? (GB|MB|TB) free/));
		await expect(main().$("button=Add folder…")).toBeEnabled();
		// The only folder can't be removed.
		await expect(main().$(`button[aria-label='Remove ${LIBRARY}']`)).not.toExist();
	});

	it("keeps the bandwidth limit", async () => {
		await openSettings("Downloads");
		await main().$("select").selectByVisibleText("20 MB/s");
		await browser.waitUntil(() => saved().speedLimitKib === 20_480);
	});

	it("renames the device", async () => {
		await openSettings("Saves");
		await fill(deviceName(), "Test rig");
		await main().$("h1").click();
		await expect(footer()).toHaveText(expect.stringContaining("Linux · Test rig"));
		expect(saved().deviceName).toBe("Test rig");
	});

	it("turns save sync off and on", async () => {
		await expect(syncSwitch()).toHaveAttribute("aria-checked", "true");
		await syncSwitch().click();
		await expect(syncSwitch()).toHaveAttribute("aria-checked", "false");
		expect(saved().saveSync).toBe(false);
	});

	it("says on a game's page that save sync is off", async () => {
		await install("Tin Kettle");
		await expect($("section[aria-labelledby='h-saves']")).toHaveText(expect.stringContaining("Save sync is off."));
		await expect(main()).toHaveText(expect.stringMatching(/SAVES\s*Off/));

		await $("section[aria-labelledby='h-saves']").$("button=Open settings").click();
		await expect(main().$("h1")).toHaveText("Settings", { ignoreCase: true });
		await openSettings("Saves");
		await syncSwitch().click();
		await expect(syncSwitch()).toHaveAttribute("aria-checked", "true");
		expect(saved().saveSync).toBe(true);
	});

	it("keeps a library folder that holds a game", async () => {
		await openSettings("Library folders");
		await expect(main().$(`button[aria-label='Remove ${LIBRARY}']`)).not.toExist();
	});

	it("shows the app's version", async () => {
		await expect($("nav[aria-label='Settings sections']")).toHaveText(expect.stringMatching(/Stault \d+\.\d+\.\d+/));
	});

	it("still has all of it when the app starts again", async () => {
		await restart();
		await openSettings("Saves");
		await expect(deviceName()).toHaveValue("Test rig");
		await openSettings("Downloads");
		await expect(main().$("select")).toHaveValue("20480");
		await openGame("Tin Kettle");
		await expect(main()).toHaveText("Installed ·", { containing: true, ignoreCase: true });
	});
});
