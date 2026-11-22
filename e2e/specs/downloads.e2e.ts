import { readdirSync } from "node:fs";
import { $, browser, expect } from "@wdio/globals";
import { confirm, footer, hero, LIBRARY, main, openGame, openSettings, section, signIn, toast } from "../app.ts";

const current = () => $("section[aria-label='Current download']");
const queue = () => $("section[aria-labelledby='h-q']");
const progress = async () => Number(await current().$("[role=progressbar]").getAttribute("aria-valuenow"));

// Longhaul and Deep Current each carry 200 MB. At 5 MB/s a download lasts
// long enough to be paused, queued behind and cancelled.
describe("Downloads", () => {
	before(signIn);

	it("starts with nothing to show", async () => {
		await section("Downloads").click();
		await expect(main()).toHaveText(expect.stringContaining("Nothing downloading."));
		await expect(main().$("button=Pause all")).toBeDisabled();
	});

	it("limits the bandwidth, in Settings as well", async () => {
		await main().$("select").selectByVisibleText("5 MB/s");
		await openSettings("Downloads");
		await expect(main().$("select")).toHaveValue("5120");
	});

	it("shows a download on the game's page", async () => {
		await section("Downloads").click();
		await main().$("button=Browse library").click();
		await openGame("Longhaul");
		await hero("Install").click();
		await confirm("Install");
		await expect(toast()).toHaveText(expect.stringContaining("Downloading Longhaul"));
		await expect(hero("Downloading")).toExist();
		await expect($("section[aria-label='Install progress']")).toHaveText(expect.stringContaining("Installing Longhaul"));
	});

	it("shows it on the Downloads page, in the title bar and in the footer", async () => {
		await main().$("button=Open downloads").click();
		await expect(current()).toHaveText("Downloading", { containing: true, ignoreCase: true });
		await expect(current().$("h2")).toHaveText("Longhaul", { ignoreCase: true });
		await expect(current()).toHaveText(expect.stringContaining("of 200 MB"));
		await expect(section("Downloads")).toHaveText(expect.stringContaining("1"));
		await expect(footer()).toHaveText(expect.stringContaining("Downloading Longhaul"));
		await browser.waitUntil(async () => (await progress()) > 0);
	});

	it("pauses and resumes", async () => {
		await current().$("button=Pause").click();
		await expect(current().$("button=Resume")).toExist();
		await expect(footer()).toHaveText(expect.stringContaining("1 paused"));
		const at = await progress();
		await browser.pause(1500);
		expect(await progress()).toBe(at);

		await current().$("button=Resume").click();
		await expect(current().$("button=Pause")).toExist();
		await browser.waitUntil(async () => (await progress()) > at);
	});

	it("queues a second install behind the first", async () => {
		await openGame("Deep Current");
		await hero("Install").click();
		await confirm("Add to queue");
		await expect(toast()).toHaveText(expect.stringContaining("Queued Deep Current"));

		await section("Downloads").click();
		await expect(queue()).toHaveText(expect.stringContaining("Deep Current"));
		await expect(queue()).toHaveText(expect.stringContaining("Queued · 0%"));
		await expect(section("Downloads")).toHaveText(expect.stringContaining("2"));
		await expect(footer()).toHaveText(expect.stringContaining("1 queued"));
	});

	it("moves a queued download to the front", async () => {
		await queue().$("button[aria-label='Move up']").click();
		await expect(current().$("h2")).toHaveText("Deep Current", { ignoreCase: true });
		await expect(queue()).toHaveText(expect.stringContaining("Longhaul"));
	});

	it("pauses and resumes everything at once", async () => {
		await main().$("button=Pause all").click();
		await expect(main().$("button=Resume all")).toExist();
		await expect(footer()).toHaveText(expect.stringContaining("2 paused"));
		await main().$("button=Resume all").click();
		await expect(main().$("button=Pause all")).toExist();
	});

	it("takes a download out of the queue", async () => {
		await queue().$("button[aria-label='Remove from queue']").click();
		await expect(queue()).not.toExist();
		await expect(section("Downloads")).toHaveText(expect.stringContaining("1"));
	});

	it("cancels the current download and leaves nothing behind", async () => {
		await current().$("button=Cancel").click();
		await expect(main()).toHaveText(expect.stringContaining("Nothing downloading."));
		await expect(footer()).toHaveText(expect.stringContaining("No downloads"));
		await browser.waitUntil(() => readdirSync(LIBRARY).length === 0);

		await openGame("Deep Current");
		await expect(hero("Install")).toExist();
	});
});
