import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { dialog, gameList, install, installFolder, LIBRARY, main, NATIVE, openGame, signIn } from "../app.ts";

const gear = () => main().$("button[aria-label='Properties']");
const menu = () => $("[role=menu]");
const program = () => dialog().$("select");
const folder = () => installFolder(NATIVE.title, readdirSync(LIBRARY));
/**
 * A second program further down, so Play still starts the game's own by
 * itself. Named as the app names it, with this system's path separator.
 */
const other = join("tools", `config${extname(NATIVE.program)}`);
/** The program the install's record says starts the game. */
const remembered = () =>
	JSON.parse(readFileSync(join(folder(), ".stault", "manifest.json"), "utf8")).executable;

describe("A game's properties", () => {
	before(signIn);

	it("are only offered for an installed game", async () => {
		await openGame(NATIVE.title);
		await expect(gear()).not.toExist();
		await gameList().$(`button*=${NATIVE.title}`).click({ button: "right" });
		await expect(menu().$("button*=Properties")).not.toExist();
		await browser.keys("Escape");
	});

	it("show the program Play starts, among the others in the game's files", async () => {
		await install(NATIVE.title);
		mkdirSync(join(folder(), "files", "tools"));
		writeFileSync(join(folder(), "files", other), "#!/bin/sh\n");

		await gear().click();
		await expect(dialog().$("h2")).toHaveText(NATIVE.title, { ignoreCase: true });
		await expect(program()).toHaveValue(NATIVE.program);
		await expect(program().$(`option=${other}`)).toExist();
	});

	it("remember another program at once", async () => {
		await program().selectByVisibleText(other);
		await browser.waitUntil(() => remembered() === other);
		await dialog().$("button=Close").click();
		await expect(dialog()).not.toExist();
	});

	it("open from the game's menu as well", async () => {
		await gameList().$(`button*=${NATIVE.title}`).click({ button: "right" });
		await menu().$("button=Properties…").click();
		await expect(program()).toHaveValue(other);
		await program().selectByVisibleText(NATIVE.program);
		await browser.waitUntil(() => remembered() === NATIVE.program);
	});

	it("open the choice of the game's save entry on top", async () => {
		// "Choose…" or "Change…", usable once Stault has looked up where the game keeps its saves.
		const entry = dialog().$("button[aria-label$='save locations']");
		await entry.waitForEnabled({ timeout: 30_000 });
		await entry.click();
		await expect($("h2*=Which game is")).toHaveText(`Which game is ${NATIVE.title}?`, { ignoreCase: true });

		await browser.keys("Escape");
		await expect($("h2*=Which game is")).not.toExist();
		await expect(dialog().$("h2")).toHaveText(NATIVE.title, { ignoreCase: true });
		await browser.keys("Escape");
		await expect(dialog()).not.toExist();
	});
});
