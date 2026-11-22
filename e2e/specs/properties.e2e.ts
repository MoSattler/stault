import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { dialog, gameList, install, installFolder, LIBRARY, main, openGame, signIn } from "../app.ts";

const gear = () => main().$("button[aria-label='Properties']");
const menu = () => $("[role=menu]");
const program = () => dialog().$("select");
const folder = () => installFolder("Tin Kettle", readdirSync(LIBRARY));
/** The program the install's record says starts the game. */
const remembered = () =>
	JSON.parse(readFileSync(join(folder(), ".stault", "manifest.json"), "utf8")).executable;

describe("A game's properties", () => {
	before(signIn);

	it("are only offered for an installed game", async () => {
		await openGame("Tin Kettle");
		await expect(gear()).not.toExist();
		await gameList().$("button*=Tin Kettle").click({ button: "right" });
		await expect(menu().$("button*=Properties")).not.toExist();
		await browser.keys("Escape");
	});

	it("show the program Play starts, among the others in the game's files", async () => {
		await install("Tin Kettle");
		// A second program further down, so Play still starts start.sh by itself.
		mkdirSync(join(folder(), "files", "tools"));
		writeFileSync(join(folder(), "files", "tools", "config.sh"), "#!/bin/sh\n");

		await gear().click();
		await expect(dialog().$("h2")).toHaveText("Tin Kettle", { ignoreCase: true });
		await expect(program()).toHaveValue("start.sh");
		await expect(program().$("option=tools/config.sh")).toExist();
	});

	it("remember another program at once", async () => {
		await program().selectByVisibleText("tools/config.sh");
		await browser.waitUntil(() => remembered() === "tools/config.sh");
		await dialog().$("button=Close").click();
		await expect(dialog()).not.toExist();
	});

	it("open from the game's menu as well", async () => {
		await gameList().$("button*=Tin Kettle").click({ button: "right" });
		await menu().$("button=Properties…").click();
		await expect(program()).toHaveValue("tools/config.sh");
		await program().selectByVisibleText("start.sh");
		await browser.waitUntil(() => remembered() === "start.sh");
	});

	it("open the choice of the game's save entry on top", async () => {
		// "Choose…" or "Change…", usable once Stault has looked up where the game keeps its saves.
		const entry = dialog().$("button[aria-label$='save locations']");
		await entry.waitForEnabled({ timeout: 30_000 });
		await entry.click();
		await expect($("h2*=Which game is")).toHaveText("Which game is Tin Kettle?", { ignoreCase: true });

		await browser.keys("Escape");
		await expect($("h2*=Which game is")).not.toExist();
		await expect(dialog().$("h2")).toHaveText("Tin Kettle", { ignoreCase: true });
		await browser.keys("Escape");
		await expect(dialog()).not.toExist();
	});
});
