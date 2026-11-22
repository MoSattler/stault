import { $, $$, browser, expect } from "@wdio/globals";
import { fill, footer, gameList, listedGames, main, section, signIn, SYSTEM } from "../app.ts";

const search = () => $("input[aria-label='Search library']");
/** The titles in the "All games" grid, in the order shown. */
const tiles = () =>
	browser.execute(() =>
		[...document.querySelectorAll("section[aria-labelledby='h-all'] button")].map(
			(tile) => tile.children[1].textContent!,
		),
	);

describe("The library", () => {
	before(signIn);

	it("lists the server's games by name", async () => {
		const titles = await listedGames();
		expect(titles).toEqual(expect.arrayContaining(["Harbor Lights", "Pixel Drift", "Tin Kettle"]));
		expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
		await expect(gameList().$("button*=All ·")).toHaveText(`All · ${titles.length}`);
		await expect(search()).toHaveAttribute("placeholder", `Search ${titles.length} games`);
	});

	it("narrows the list as you type", async () => {
		await fill(search(), "pixel");
		await browser.waitUntil(async () => (await listedGames()).length === 1);
		expect(await listedGames()).toEqual(["Pixel Drift"]);

		await fill(search(), "no such game");
		await expect(gameList()).toHaveText(expect.stringContaining("No games match “no such game”."));
		await fill(search(), "");
	});

	it("jumps to the search field on Ctrl+K", async () => {
		await $("#h-all").click();
		await browser.keys(["Control", "k"]);
		await expect(search()).toBeFocused();
	});

	it("shows only installed games on request", async () => {
		await fill(search(), "");
		const installed = gameList().$("button*=Installed ·");
		await installed.click();
		await expect(installed).toHaveAttribute("aria-pressed", "true");
		await expect(gameList()).toHaveText(expect.stringContaining("Nothing installed on this device yet."));

		await gameList().$("button*=All ·").click();
		await browser.waitUntil(async () => (await listedGames()).length > 0);
	});

	it("opens on Home with every game", async () => {
		const count = (await listedGames()).length;
		await expect($("#h-all")).toHaveText(`All games · ${count}`, { ignoreCase: true });
		await expect($("#h-new")).toHaveText("Recently added", { ignoreCase: true });
		expect(await tiles()).toHaveLength(count);
		// Nothing is installed, so there is nothing to jump back into.
		await expect($("#h-cont")).not.toExist();
	});

	it("sorts the grid", async () => {
		const sort = main().$("select");
		await sort.selectByVisibleText("Name");
		expect(await tiles()).toEqual(await listedGames());

		// The two samples with 200 MB of ballast are the largest by far.
		await sort.selectByVisibleText("Size on server");
		expect((await tiles()).slice(0, 2).sort()).toEqual(["Deep Current", "Longhaul"]);
	});

	it("opens a game from its tile and comes back", async () => {
		await $("section[aria-labelledby='h-all']").$("button*=Tin Kettle").click();
		await expect(main().$("h1")).toHaveText("Tin Kettle", { ignoreCase: true });

		await main().$("button*=Library").click();
		await expect($("#h-all")).toExist();
	});

	it("moves between sections from the title bar", async () => {
		await section("Downloads").click();
		await expect(main().$("h1")).toHaveText("Downloads", { ignoreCase: true });
		await expect(section("Downloads")).toHaveAttribute("aria-pressed", "true");
		await expect(section("Library")).toHaveAttribute("aria-pressed", "false");

		await $("button[aria-label='Settings']").click();
		await expect(main().$("h1")).toHaveText("Settings", { ignoreCase: true });

		await section("Library").click();
		await expect($("#h-all")).toExist();
		await expect(section("Library")).toHaveAttribute("aria-pressed", "true");
	});

	it("names the system and says nothing is downloading", async () => {
		await expect(footer()).toHaveText(expect.stringContaining(`${SYSTEM} ·`));
		await expect(footer()).toHaveText(expect.stringContaining("No downloads"));
		expect(await $$("button[aria-label='Close']")).toHaveLength(1);
	});
});
