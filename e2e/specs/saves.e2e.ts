import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { $, browser, expect } from "@wdio/globals";
import {
	confirm, dialog, fill, hero, install, installFolder, LIBRARY, main, PASSWORD, SERVER, signIn, toast, toastGone, USER,
} from "../app.ts";

const card = () => $("section[aria-labelledby='h-saves']");
const query = () => dialog().$("input[aria-label=\"Search Ludusavi's games\"]");
/** The switch in the game's properties that turns sync on and off for this game alone. */
const gameSync = () => dialog().$("button[role=switch][aria-label='Sync saves']");
const folder = () => installFolder("Pixel Drift", readdirSync(LIBRARY));
const manifest = () => JSON.parse(readFileSync(join(folder(), ".stault", "manifest.json"), "utf8"));
/** Pixel Drift says in its own files that its save is save.txt beside the program. */
const saveFile = () => join(folder(), "files", "save.txt");
// Different on every run, so a save from an earlier run is never mistaken for this one's.
const mine = `saved by the end-to-end tests at ${new Date().toISOString()}\n`;
const changed = `${mine}and changed on this device\n`;

/**
 * Stands in for a second device: uploads the server's newest save of Pixel
 * Drift once more, as another install would. The server then holds a save
 * this device has not seen.
 */
async function uploadFromAnotherDevice() {
	const get = async (path: string, headers: Record<string, string>) => {
		const response = await fetch(`${SERVER}${path}`, { headers });
		if (!response.ok) throw new Error(`${path}: ${response.status}`);
		return response;
	};
	const basic = `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString("base64")}`;
	const { access_token } = await (await get("/api/auth/basic/login", { Authorization: basic })).json();
	const auth = { Authorization: `Bearer ${access_token}` };
	const me = await (await get("/api/users/me", auth)).json();
	const games = await (await get("/api/games?limit=-1", auth)).json();
	const game = games.data.find((g: { title: string }) => g.title === "Pixel Drift");
	const saves = `/api/savefiles/user/${me.id}/game/${game.id}`;

	const body = new FormData();
	body.append("file", await (await get(saves, auth)).blob(), "save.zip");
	const response = await fetch(`${SERVER}${saves}`, {
		method: "POST",
		headers: { ...auth, "X-Installation-Id": randomUUID() },
		body,
	});
	if (!response.ok) throw new Error(`Uploading a save: ${response.status}`);
}

/** Changes the save on this device after another device has uploaded one, then presses Play. */
async function playIntoConflict(text: string) {
	await uploadFromAnotherDevice();
	writeFileSync(saveFile(), text);
	await hero("Play").click();
	await expect(dialog().$("h2")).toHaveText("Which saves for Pixel Drift?", { ignoreCase: true, wait: 30_000 });
}

describe("Save sync", () => {
	before(signIn);

	it("finds out where an installed game keeps its saves", async () => {
		await install("Pixel Drift");
		await expect(card()).toHaveText(expect.stringContaining("Save locations from Ludusavi's entry Pixel Drift"), {
			wait: 30_000,
		});
	});

	it("uploads this device's save", async () => {
		writeFileSync(saveFile(), mine);
		await card().$("button=Upload now").click();
		await expect(card()).toHaveText(expect.stringContaining("In step with"), { wait: 30_000 });
		await expect(card()).toHaveText(expect.stringContaining("Last save uploaded"));
		await expect(main()).toHaveText(expect.stringMatching(/SAVES\s*In sync/));
	});

	it("fetches the save back from the server", async () => {
		writeFileSync(saveFile(), "overwritten on this device\n");
		await card().$("button=Fetch from server").click();
		await browser.waitUntil(() => readFileSync(saveFile(), "utf8") === mine, { timeout: 30_000 });
		await hero("Play").waitForExist();
	});

	it("asks which saves to keep when both sides have new ones, before the game starts", async () => {
		await playIntoConflict(changed);
		await expect(dialog()).toHaveText(expect.stringContaining(`Use the save on ${new URL(SERVER).host}`));
		await dialog().$("button=Don't start").click();
		await expect(hero("Play")).toExist();
		await expect(card()).toHaveText(expect.stringContaining("Saves changed on this device and on another one."));
		await expect(main()).toHaveText(expect.stringMatching(/SAVES\s*Needs your choice/));
	});

	it("keeps this device's saves when told to", async () => {
		await toastGone();
		await card().$("button=Choose which to keep…").click();
		await dialog().$("button*=Keep the saves on").click();
		await expect(card()).toHaveText(expect.stringContaining("In step with"), { wait: 30_000 });
		expect(readFileSync(saveFile(), "utf8")).toBe(changed);
	});

	it("takes the server's save when told to", async () => {
		// The other device now uploads what this one just did; this one changes its save again.
		await playIntoConflict("changed once more on this device\n");
		await dialog().$("button=Don't start").click();
		await toastGone();
		await card().$("button=Choose which to keep…").click();
		await dialog().$("button*=Use the save on").click();
		await browser.waitUntil(() => readFileSync(saveFile(), "utf8") === changed, { timeout: 30_000 });
		await expect(card()).toHaveText(expect.stringContaining("In step with"), { wait: 30_000 });
	});

	it("lets the game be matched to another Ludusavi entry", async () => {
		await card().$("button=Change").click();
		await expect(dialog().$("h2")).toHaveText("Which game is Pixel Drift?", { ignoreCase: true });
		await expect(dialog().$("button*=Pixel Drift")).toHaveText(expect.stringContaining("CURRENT"));

		await fill(query(), "zzzz no such game");
		await dialog().$("button=Search").click();
		await expect(dialog()).toHaveText(expect.stringContaining("Nothing found."));

		await fill(query(), "Pixel Drift");
		await dialog().$("button=Search").click();
		// Marked CURRENT too, so matched by its start.
		await dialog().$("ul").$("button*=Pixel Drift").click();
		// Choosing starts a sync, even of the entry already in use. The card reads the same before it as after it,
		// so see it start, then end: until then its buttons are disabled, and a click on one does nothing.
		await expect(card()).toHaveText(expect.stringContaining("Syncing"));
		await expect(card()).toHaveText(expect.stringContaining("In step with"), { wait: 30_000 });
		await expect(card()).toHaveText(expect.stringContaining("Save locations from Ludusavi's entry Pixel Drift"));
	});

	it("syncs save files chosen by hand instead of a Ludusavi entry", async () => {
		await toastGone();
		await card().$("button=Change").click();
		await dialog().$("button=Choose the save files yourself").click();
		await expect(dialog().$("h2")).toHaveText("Where does Pixel Drift save?", { ignoreCase: true });

		// A path that doesn't say where it starts is turned down, and the dialog stays open.
		await fill(dialog().$("input[aria-label='New save path']"), "save.txt");
		await confirm("Use these");
		await expect(toast()).toHaveText(expect.stringContaining("is not a full path"));
		await expect(dialog()).toExist();

		// Typed in full, the path is kept relative to the game's files, as a picked one would be.
		await fill(dialog().$("input[aria-label='Save path 1']"), saveFile());
		await confirm("Use these");
		await expect(dialog()).not.toExist();
		await expect(card()).toHaveText(expect.stringContaining("Save locations you chose"));
		await expect(card()).toHaveText(expect.stringContaining("<base>/save.txt"));
		expect(manifest().saves.paths).toEqual(["<base>/save.txt"]);

		// The round trip: up from this device, then back over a changed file.
		// Choosing starts a sync here too. A save changed before it ends would be a conflict, rightly.
		const upload = card().$("button=Upload now");
		await upload.waitForEnabled({ timeout: 30_000 });
		await expect(card()).toHaveText(expect.stringContaining("In step with"));
		const byHand = `${changed}and synced as a file chosen by hand\n`;
		writeFileSync(saveFile(), byHand);
		const before = manifest().saves.syncedAt;
		await toastGone();
		await upload.click();
		await browser.waitUntil(() => manifest().saves.syncedAt !== before, { timeout: 30_000 });

		writeFileSync(saveFile(), "overwritten on this device\n");
		const fetchBack = card().$("button=Fetch from server");
		await fetchBack.waitForEnabled({ timeout: 30_000 });
		await toastGone();
		await fetchBack.click();
		await browser.waitUntil(() => readFileSync(saveFile(), "utf8") === byHand, { timeout: 30_000 });
	});

	it("leaves the game's saves alone while sync is off for it", async () => {
		await toastGone();
		await main().$("button[aria-label='Properties']").click();
		await gameSync().click();
		await expect(gameSync()).toHaveAttribute("aria-checked", "false");
		await browser.waitUntil(() => manifest().syncSaves === false);
		await browser.keys("Escape");

		await expect(card()).toHaveText(expect.stringContaining("Save sync is off for this game."));
		await expect(main()).toHaveText(expect.stringMatching(/SAVES\s*Off/));
		await expect(card().$("button=Upload now")).not.toExist();
	});

	it("uploads what changed meanwhile once sync is back on", async () => {
		writeFileSync(saveFile(), `${changed}and while sync was off\n`);
		await card().$("button=Open properties").click();
		await gameSync().click();
		await expect(gameSync()).toHaveAttribute("aria-checked", "true");
		await browser.keys("Escape");

		await expect(toast()).toHaveText(expect.stringContaining("Pixel Drift: saves uploaded"), { wait: 30_000 });
		await expect(card()).toHaveText(expect.stringContaining("In step with"));
		expect(manifest().syncSaves).toBeUndefined();
	});
});
