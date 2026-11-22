import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { $, expect } from "@wdio/globals";
import { HOME, openGame, signIn } from "../app.ts";

describe("Installing a game", () => {
	before(signIn);

	it("downloads Tin Kettle and makes it playable", async () => {
		await openGame("Tin Kettle");
		await $("main").$("button*=Install").click();
		await $("dialog[open]").$("button=Install").click();
		await $("main").$("button*=Play").waitForExist({ timeout: 30_000 });
	});

	it("puts the game into the default library folder", () => {
		const library = join(HOME, "Games", "Stault");
		const [folder] = readdirSync(library).filter((name) => name.startsWith("Tin Kettle"));
		expect(existsSync(join(library, folder, ".stault", "manifest.json"))).toBe(true);
		expect(existsSync(join(library, folder, "files", "start.sh"))).toBe(true);
	});
});
