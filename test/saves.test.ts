import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApiError, type GameVaultClient, OfflineError, parseSaveName } from "../src/bun/gamevault/client";
import { filesDir, gameDir, Installs, workDir } from "../src/bun/installs";
import { nextStep, saveKind, Saves } from "../src/bun/saves";
import { globEscape, Ludusavi, ludusaviConfig, readScan } from "../src/bun/saves/ludusavi";
import type { GameType, Platform, SaveSync } from "../src/shared/model";

describe("the pieces", () => {
	test("a save's name tells when it was uploaded and by which install", () => {
		expect(
			parseSaveName('attachment; filename="1795293843806_24660172-3e73-4539-8653-286a02ba82d9.zip"'),
		).toEqual({ uploadedAt: 1795293843806, installationId: "24660172-3e73-4539-8653-286a02ba82d9" });
		expect(parseSaveName(null)).toBeNull();
		expect(parseSaveName("attachment")).toBeNull();
	});

	test("nothing is overwritten unseen: both sides changed means compare first", () => {
		expect(nextStep(false, false)).toBe("nothing");
		expect(nextStep(false, true)).toBe("upload");
		expect(nextStep(true, false)).toBe("restore");
		expect(nextStep(true, true)).toBe("compare");
	});

	test("a Windows build's saves are shared between Windows and Linux, never with a Mac", () => {
		expect(saveKind("windows", "WINDOWS_PORTABLE")).toBe("windows");
		expect(saveKind("linux", "WINDOWS_SETUP")).toBe("windows");
		expect(saveKind("linux", "LINUX_PORTABLE")).toBe("linux");
		expect(saveKind("macos", "UNDETECTABLE")).toBe("mac");
	});

	test("Ludusavi is pointed at Stault's folder layout, with the official client's path names", () => {
		const config = ludusaviConfig(
			{ gameDir: "/lib/Celeste [12]", filesDir: "/lib/Celeste [12]/files", userDir: "/Users/sam" },
			"Celeste",
		);
		// "[" is a glob character in a root path.
		expect(config.roots).toEqual([{ store: "other", path: "/lib/Celeste [[]12]" }]);
		expect(config.customGames).toEqual([{ name: "Celeste", integration: "extend", installDir: ["files"] }]);
		// The install folder is redirected before the user folder it may sit in.
		expect(config.redirects.map((r) => [r.source, r.target])).toEqual([
			["/lib/Celeste [12]/files", "G:\\gamevault\\installation"],
			["/Users/sam", "G:\\gamevault\\currentuser"],
		]);
		expect(globEscape("a [1] [2]")).toBe("a [[]1] [[]2]");
	});

	test("a scan with no files means no saves, and only a differing one counts as changed", () => {
		expect(readScan({ games: {} }, "X")).toEqual({ found: false, changed: false, files: [] });
		const file = { "/s": {} };
		expect(readScan({ games: { X: { change: "Same", files: file } } }, "X")).toEqual({ found: true, changed: false, files: ["/s"] });
		expect(readScan({ games: { X: { change: "Different", files: file } } }, "X")).toEqual({ found: true, changed: true, files: ["/s"] });
		expect(readScan({ games: { X: { change: "New", files: { "/s": { ignored: true } } } } }, "X")).toEqual({ found: false, changed: false, files: [] });
	});
});

// --- The real thing: bundled Ludusavi and 7-Zip, two devices, a stand-in server ---

const os = { darwin: "mac", win32: "win", linux: "linux" }[process.platform as "darwin" | "win32" | "linux"];
const sevenZip = join(import.meta.dir, "..", "node_modules", "7zip-bin-full", os, process.arch, os === "win" ? "7z.exe" : "7zz");
const vendor = join(import.meta.dir, "..", "vendor", "ludusavi");
const binary = join(vendor, os === "win" ? "ludusavi.exe" : "ludusavi");
// Kept between runs, so Ludusavi downloads its game list once a day, not once a test.
const configDir = join(vendor, "test-config");
// `hutch dev/fetch-ludusavi.ts` puts the binary there. HOME does not move the user folder on Windows.
const ready = existsSync(binary) && process.platform !== "win32";

const root = mkdtempSync(join(tmpdir(), "stault-saves-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const here: { platform: Platform; type: GameType } =
	process.platform === "darwin"
		? { platform: "macos", type: "UNDETECTABLE" }
		: { platform: "linux", type: "LINUX_PORTABLE" };

/** Holds saves the way GameVault does: only the newest can be fetched. */
function fakeServer() {
	const stored: { at: number; id: string; zip: Blob }[] = [];
	const state = { online: true, enabled: true };
	let clock = 1_700_000_000_000;
	const guard = () => {
		if (!state.online) throw new OfflineError("http://gv");
		if (!state.enabled) throw new ApiError(405, "This API endpoint is disabled.");
	};
	const client = {
		serverUrl: "http://gv",
		async newestSave() {
			guard();
			const save = stored.at(-1);
			return save ? { uploadedAt: save.at, installationId: save.id } : null;
		},
		async downloadSave() {
			guard();
			const save = stored.at(-1);
			if (!save) throw new ApiError(404, "Savefile was not found.");
			return new Response(save.zip, {
				headers: { "Content-Disposition": `attachment; filename="${save.at}_${save.id}.zip"` },
			});
		},
		async uploadSave(_user: number, _game: number, zip: Blob, id: string) {
			guard();
			// Read now: the file behind the blob is deleted after the upload.
			stored.push({ at: ++clock, id, zip: new Blob([await zip.arrayBuffer()]) });
		},
	} as unknown as GameVaultClient;
	return { client, stored, state };
}

type Server = ReturnType<typeof fakeServer>;

/** One device with the game installed: its own home folder and library folder. */
function device(server: Server, name: string, options: { known?: boolean; as?: typeof here } = {}) {
	const home = join(root, name, "home");
	const dir = gameDir(join(root, name, "library"), "Harbor Lights", 3);
	const files = filesDir(dir);
	const { platform, type } = options.as ?? here;
	mkdirSync(files, { recursive: true });
	mkdirSync(home, { recursive: true });
	// The game describes its own saves, so the test does not lean on Ludusavi's list:
	// one in its folder, one in the user folder.
	if (options.known !== false) {
		writeFileSync(
			join(files, ".ludusavi.yaml"),
			"Harbor Lights:\n  files:\n    <base>/save.txt: {}\n    <home>/harbor/profile.txt: {}\n",
		);
	}
	const installs = new Installs(() => {});
	installs.add(dir, {
		serverUrl: "http://gv",
		gameId: 3,
		versionId: 1,
		version: null,
		type,
		title: "Harbor Lights",
		installedAt: new Date().toISOString(),
		sizeBytes: 0,
	});
	const seen = { status: null as SaveSync | null, serverOff: false, running: null as number | null, notices: [] as string[] };
	const saves = new Saves({
		platform,
		ludusavi: new Ludusavi(binary, configDir, home),
		sevenZip,
		installs,
		home,
		prefixesDir: join(root, name, "prefixes"),
		enabled: () => true,
		deviceName: () => `Device ${name}`,
		client: () => server.client,
		userId: () => 1,
		titles: () => [options.known === false ? "Zzyzx Not A Game 4711" : "Harbor Lights"],
		running: () => seen.running,
		onChange: (list, serverOff) => {
			seen.status = list[0] ?? null;
			seen.serverOff = serverOff;
		},
		notify: (text) => seen.notices.push(text),
	});
	return {
		saves,
		seen,
		dir,
		record: () => installs.get(3)!.manifest.saves!,
		play(save: string, profile = "profile") {
			mkdirSync(join(home, "harbor"), { recursive: true });
			writeFileSync(join(files, "save.txt"), save);
			writeFileSync(join(home, "harbor", "profile.txt"), profile);
		},
		save: () => (existsSync(join(files, "save.txt")) ? readFileSync(join(files, "save.txt"), "utf8") : null),
		profile: () => (existsSync(join(home, "harbor", "profile.txt")) ? readFileSync(join(home, "harbor", "profile.txt"), "utf8") : null),
	};
}

describe.skipIf(!ready)("two devices and a server", () => {
	test("a save made on one device arrives on the other, in a different home and library folder", async () => {
		const server = fakeServer();
		const a = device(server, "a1");
		const b = device(server, "b1");

		a.play("chapter 1", "sam");
		expect(await a.saves.sync(3)).toBe("uploaded");
		expect(server.stored).toHaveLength(1);
		expect(a.seen.status).toMatchObject({ state: "idle", name: "Harbor Lights" });
		expect(a.record().syncedAt).toBe(server.stored[0].at);

		expect(await b.saves.sync(3)).toBe("restored");
		expect(b.save()).toBe("chapter 1");
		expect(b.profile()).toBe("sam");

		// In step: nothing moves either way.
		expect(await b.saves.sync(3)).toBe("synced");
		expect(await a.saves.sync(3)).toBe("synced");
		expect(server.stored).toHaveLength(1);

		b.play("chapter 2", "sam");
		expect(await b.saves.sync(3)).toBe("uploaded");
		expect(await a.saves.sync(3)).toBe("restored");
		expect(a.save()).toBe("chapter 2");
	}, 60_000);

	test("saves made while the server is away go up once it is back", async () => {
		const server = fakeServer();
		const a = device(server, "a2");
		a.play("one");
		await a.saves.sync(3);

		server.state.online = false;
		a.play("two");
		expect(await a.saves.sync(3)).toBe("offline");
		expect(a.record().pending).toBe(true);
		expect(a.seen.status?.state).toBe("pending");
		expect(server.stored).toHaveLength(1);

		server.state.online = true;
		expect(await a.saves.sync(3)).toBe("uploaded");
		expect(a.record().pending).toBe(false);
		expect(server.stored).toHaveLength(2);
	}, 60_000);

	test("when both sides changed, nothing moves until the user chooses", async () => {
		const server = fakeServer();
		const a = device(server, "a3");
		const b = device(server, "b3");
		a.play("shared start");
		await a.saves.sync(3);
		await b.saves.sync(3);

		// A plays without the server; B plays and uploads.
		server.state.online = false;
		a.play("A's progress");
		await a.saves.sync(3);
		server.state.online = true;
		b.play("B's progress");
		await b.saves.sync(3);
		expect(server.stored).toHaveLength(2);

		expect(await a.saves.sync(3)).toBe("conflict");
		expect(a.save()).toBe("A's progress");
		expect(server.stored).toHaveLength(2);
		// What the user is shown to choose by: when and from where the server's save came, and how fresh the local one is.
		expect(a.seen.status).toMatchObject({
			state: "conflict",
			conflict: { serverAt: new Date(server.stored[1].at).toISOString(), serverDevice: "Device b3" },
		});
		expect(Date.now() - Date.parse(a.seen.status!.conflict!.localAt!)).toBeLessThan(60_000);
		// Pressing Play asks instead of starting.
		expect(await a.saves.beforePlay(3)).toEqual({ status: "save-conflict" });

		// "Use the server's save": A's own saves are kept aside first.
		expect(await a.saves.sync(3, "download")).toBe("restored");
		expect(a.save()).toBe("B's progress");
		expect(existsSync(join(workDir(a.dir), "saves-replaced", "Harbor Lights", "mapping.yaml"))).toBe(true);
		expect(a.seen.status?.state).toBe("idle");
		expect(await a.saves.beforePlay(3)).toBeNull();
	}, 60_000);

	test("choosing this device's saves makes them the newest for everyone", async () => {
		const server = fakeServer();
		const a = device(server, "a4");
		const b = device(server, "b4");
		a.play("start");
		await a.saves.sync(3);
		await b.saves.sync(3);
		server.state.online = false;
		a.play("A's progress");
		await a.saves.sync(3);
		server.state.online = true;
		b.play("B's progress");
		await b.saves.sync(3);
		expect(await a.saves.sync(3)).toBe("conflict");

		expect(await a.saves.sync(3, "upload")).toBe("uploaded");
		expect(server.stored).toHaveLength(3);
		expect(await b.saves.sync(3)).toBe("restored");
		expect(b.save()).toBe("A's progress");
	}, 60_000);

	test("the same saves on both sides are not a conflict (a reinstall)", async () => {
		const server = fakeServer();
		const a = device(server, "a5");
		a.play("same");
		await a.saves.sync(3);

		const again = device(server, "c5");
		again.play("same");
		expect(await again.saves.sync(3)).toBe("synced");
		expect(server.stored).toHaveLength(1);
		expect(again.record()).toMatchObject({ syncedAt: server.stored[0].at, pending: false });
	}, 60_000);

	test("a save from another operating system's build is left alone", async () => {
		const server = fakeServer();
		const other = device(server, "w6", { as: { platform: "windows", type: "WINDOWS_PORTABLE" } });
		other.play("windows save");
		await other.saves.sync(3);

		const a = device(server, "a6");
		a.play("mine");
		// Not restored, not a conflict; this device's saves go up as usual.
		expect(await a.saves.sync(3)).toBe("uploaded");
		expect(a.save()).toBe("mine");
		expect(a.record().foreignAt).toBe(server.stored[0].at);
		await expect(other.saves.sync(3, "download")).rejects.toThrow("another operating system");
	}, 60_000);

	test("a server with save files switched off is noticed, not retried", async () => {
		const server = fakeServer();
		server.state.enabled = false;
		const a = device(server, "a7");
		a.play("x");
		expect(await a.saves.sync(3)).toBe("skipped");
		expect(a.seen.serverOff).toBe(true);
		expect(await a.saves.sync(3)).toBe("skipped");

		// A fresh session learns it at sign-in, before any game is played.
		const b = device(server, "b7");
		await b.saves.checkServer();
		expect(b.seen.serverOff).toBe(true);
		// An unreachable server says nothing either way.
		server.state.online = false;
		const c = device(server, "c7");
		await c.saves.checkServer();
		expect(c.seen.serverOff).toBe(false);
	}, 60_000);

	test("a running game's saves are not touched", async () => {
		const server = fakeServer();
		const a = device(server, "a8");
		a.play("x");
		a.seen.running = 3;
		expect(await a.saves.sync(3)).toBe("skipped");
		await expect(a.saves.sync(3, "download")).rejects.toThrow("Stop the game first.");
		expect(server.stored).toHaveLength(0);
	}, 60_000);

	test("a game Ludusavi doesn't know is left out, until the user names it", async () => {
		const server = fakeServer();
		const a = device(server, "a9", { known: false });
		a.play("x");
		expect(await a.saves.sync(3)).toBe("skipped");
		expect(a.seen.status).toMatchObject({ state: "unsupported", name: null });

		// "Celeste" is in Ludusavi's list; choosing it starts following that entry.
		expect(await a.saves.search(3, "Celeste")).toContain("Celeste");
		await a.saves.setName(3, "Celeste");
		expect(a.record().name).toBe("Celeste");
		await a.saves.setName(3, null);
		expect(a.seen.status?.state).toBe("unsupported");
	}, 60_000);
});
