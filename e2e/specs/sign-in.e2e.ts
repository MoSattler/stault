import { $, expect } from "@wdio/globals";
import { fill, gameList, main, openSettings, PASSWORD, restart, SERVER, USER } from "../app.ts";

const host = new URL(SERVER).host;

describe("Signing in", () => {
	it("starts on the Connect screen", async () => {
		await expect($("h1")).toHaveText("Connect to GameVault", { ignoreCase: true });
		await expect($("button[type=submit]")).toBeDisabled();
	});

	it("says so when no server answers at an address", async () => {
		await fill($("#srv"), "http://127.0.0.1:9");
		await $("button=Check").click();
		await expect($("form [role=alert]")).toBeDisplayed();
	});

	it("finds the server", async () => {
		await fill($("#srv"), SERVER);
		await $("button=Check").click();
		await expect($("[role=status]")).toHaveText(expect.stringContaining("GameVault server found"));
	});

	it("turns down a wrong password", async () => {
		await fill($("#usr"), USER);
		await fill($("#pwd"), "not the password");
		await $("button[type=submit]").click();
		await expect($("form [role=alert]")).toBeDisplayed();
		await expect($("h1")).toHaveText("Connect to GameVault", { ignoreCase: true });
	});

	it("opens the library with the right one", async () => {
		await fill($("#pwd"), PASSWORD);
		await $("button[type=submit]").click();
		await gameList().waitForDisplayed();
	});

	it("shows the server and the account", async () => {
		await expect($("button[aria-label^='Server ']")).toHaveAttribute("aria-label", `Server ${host}, connected`);
		await openSettings("Account");
		await expect(main()).toHaveText(expect.stringContaining(host));
		await expect(main()).toHaveText(expect.stringContaining("connected"));
		await expect(main()).toHaveText(expect.stringContaining(USER));
	});

	it("is still signed in when the app starts again", async () => {
		await restart();
		await gameList().waitForDisplayed();
	});

	it("signs out, and remembers the server and the name", async () => {
		await openSettings("Account");
		await main().$("button=Sign out").click();
		await expect($("h1")).toHaveText("Connect to GameVault", { ignoreCase: true });
		await expect($("#srv")).toHaveValue(expect.stringContaining(host));
		await expect($("#usr")).toHaveValue(USER);
		await expect($("#pwd")).toHaveValue("");
	});

	it("needs the password again after signing out", async () => {
		await restart();
		await expect($("h1")).toHaveText("Connect to GameVault", { ignoreCase: true });
	});
});
