import { $, expect } from "@wdio/globals";
import { fill, gameList, main, openSettings, SERVER, USER } from "../app.ts";

// The browser that single sign-on opens is curl here (wdio.conf.ts, e2e.yml),
// and the test server's identity provider signs the test account in by itself.
describe("Single sign-on", () => {
	it("is offered next to the password", async () => {
		await fill($("#srv"), SERVER);
		await $("button=Check").click();
		await expect($("button=Sign in with SSO")).toBeDisplayed();
	});

	it("signs in through the browser", async () => {
		await $("button=Sign in with SSO").click();
		await gameList().waitForDisplayed({ timeout: 30_000 });
	});

	it("is the test account", async () => {
		await openSettings("Account");
		await expect(main()).toHaveText(expect.stringContaining(USER));
	});
});
