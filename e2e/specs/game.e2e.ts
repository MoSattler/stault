import { $, browser, expect } from "@wdio/globals";
import { dialog, gameList, hero, main, openGame, signIn } from "../app.ts";

const versions = () => $("section[aria-labelledby='h-ver']");
const menu = () => $("[role=menu]");

describe("A game's page", () => {
	before(signIn);

	it("shows what the server has for the game", async () => {
		await openGame("Pixel Drift");
		await expect(main()).toHaveText("2 versions on server", { containing: true, ignoreCase: true });
		await expect(hero("Install")).toHaveText(expect.stringContaining("2 versions · choose next"));
		await expect(versions()).toHaveText(expect.stringContaining("v1.2.0 · default"));
		await expect(versions()).toHaveText(expect.stringContaining("v1.1.0"));
		await expect(versions()).toHaveText(expect.stringContaining("Windows · portable"));
		await expect($("section[aria-labelledby='h-about']")).toHaveText(
			expect.stringContaining("The server has no description for this game."),
		);
		// Nothing about an install, for a game that isn't installed.
		await expect(main()).not.toHaveText(expect.stringContaining("Installed in"));
		await expect($("#h-saves")).not.toExist();
	});

	it("warns before installing a build that names no system", async () => {
		await openGame("Harbor Lights");
		await hero("Install").click();
		await expect(dialog().$("h2")).toHaveText("Harbor Lights", { ignoreCase: true });
		await expect(dialog()).toHaveText(
			expect.stringContaining("Stault checks after extracting whether it can run here"),
		);
		await dialog().$("button=Cancel").click();
		await expect(dialog()).not.toExist();
	});

	it("preselects the version whose Install button was pressed", async () => {
		await openGame("Pixel Drift");
		await versions().$$("button=Install")[1].click();
		const chosen = dialog().$("button[aria-pressed='true']*=v1.");
		await expect(chosen).toHaveText(expect.stringContaining("v1.1.0"));
		await browser.keys("Escape");
		await expect(dialog()).not.toExist();
	});

	it("opens a game's menu on a right click", async () => {
		await gameList().$("button*=Setup Quest").click({ button: "right" });
		await expect(menu()).toHaveAttribute("aria-label", "Setup Quest");
		await expect(menu().$("button*=Install")).toExist();
		// Uninstalling is only offered for an installed game.
		await expect(menu().$("button*=Uninstall")).not.toExist();

		await browser.keys("Escape");
		await expect(menu()).not.toExist();
	});

	it("starts an install from the menu", async () => {
		await gameList().$("button*=Setup Quest").click({ button: "right" });
		await menu().$("button*=Install").click();
		await expect(menu()).not.toExist();
		await expect(dialog().$("h2")).toHaveText("Setup Quest", { ignoreCase: true });
		await expect(dialog()).toHaveText(expect.stringContaining("This build ships an installer."));
		await dialog().$("button=Cancel").click();
	});
});
