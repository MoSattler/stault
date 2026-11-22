import { $, expect } from "@wdio/globals";
import { gameList, openGame, PASSWORD, SERVER, USER } from "../app.ts";

describe("Signing in", () => {
	it("starts on the Connect screen", async () => {
		await expect($("h1")).toHaveText("Connect to GameVault", { ignoreCase: true });
	});

	it("finds the server", async () => {
		await $("#srv").setValue(SERVER);
		await $("button=Check").click();
		await expect($("[role=status]")).toHaveText(expect.stringContaining("GameVault server found"));
	});

	it("turns down a wrong password", async () => {
		await $("#usr").setValue(USER);
		await $("#pwd").setValue("not the password");
		await $("button[type=submit]").click();
		await expect($("form [role=alert]")).toBeDisplayed();
	});

	it("opens the library with the right one", async () => {
		await $("#pwd").setValue(PASSWORD);
		await $("button[type=submit]").click();
		await gameList().waitForDisplayed();
		await openGame("Harbor Lights");
		await expect($("main h1")).toHaveText("Harbor Lights", { ignoreCase: true });
	});
});
