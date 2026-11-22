import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Download } from "../src/shared/model";
import { Downloads, type QueueItem } from "../src/bun/downloads";
import type { GameVaultClient } from "../src/bun/gamevault/client";
import { filesDir, gameDir, Installs, safeName, workDir } from "../src/bun/installs";

const os = { darwin: "mac", win32: "win", linux: "linux" }[process.platform as "darwin" | "win32" | "linux"];
const sevenZip = join(import.meta.dir, "..", "node_modules", "7zip-bin-full", os, process.arch, os === "win" ? "7z.exe" : "7zz");

const root = mkdtempSync(join(tmpdir(), "stault-downloads-"));
const payload = crypto.getRandomValues(new Uint8Array(65_536));
const big = Buffer.concat(Array.from({ length: 48 }, () => payload)); // ~3 MB
let archive: Buffer;
let server: Server;
let port = 0;
const requests: { url: string; range: string | null; limit: string | null }[] = [];
let honourRange = true;

beforeAll(() => {
	const source = join(root, "source");
	mkdirSync(join(source, "data"), { recursive: true });
	writeFileSync(join(source, "Game.exe"), "not a real program");
	writeFileSync(join(source, "data", "assets.bin"), big);
	const zip = join(root, "game.zip");
	const made = Bun.spawnSync([sevenZip, "a", "-mx=0", zip, "."], { cwd: source });
	if (!made.success) throw new Error(made.stderr.toString());
	archive = readFileSync(zip);

	// Behaves like GameVault: a Range request is answered with 200 and the remainder.
	server = createServer(async (request, response) => {
		const range = request.headers.range ?? null;
		requests.push({ url: request.url ?? "", range, limit: (request.headers["x-download-speed-limit"] as string) ?? null });
		const from = honourRange && range ? Number(range.match(/bytes=(\d+)-/)![1]) : 0;
		const body = archive.subarray(from);
		response.writeHead(200, { "Content-Length": body.length });
		// Trickle the file out, so a test can interrupt it part-way.
		for (let sent = 0; sent < body.length && !response.destroyed; sent += 16_384) {
			response.write(body.subarray(sent, sent + 16_384));
			await Bun.sleep(5);
		}
		response.end();
	}).listen(0, "127.0.0.1");
	port = (server.address() as AddressInfo).port;
});

afterAll(() => {
	server.closeAllConnections();
	server.close();
	rmSync(root, { recursive: true, force: true });
});

function setup(name: string) {
	const folder = join(root, name);
	const installed: QueueItem[] = [];
	let latest: Download[] = [];
	let speedLimitKib = 0;
	const installs = new Installs(() => {});
	const client = {
		download: (gameId: number, versionId: number, o: { offset: number; speedLimitKib: number; signal: AbortSignal }) =>
			fetch(`http://127.0.0.1:${port}/api/game/${gameId}/versions/${versionId}`, {
				headers: {
					...(o.offset ? { Range: `bytes=${o.offset}-` } : {}),
					...(o.speedLimitKib ? { "X-Download-Speed-Limit": String(o.speedLimitKib) } : {}),
				},
				signal: o.signal,
			}),
	} as unknown as GameVaultClient;
	const downloads = new Downloads({
		queuePath: join(folder, "queue.json"),
		sevenZip,
		installs,
		client: () => client,
		serverUrl: () => "http://gv",
		speedLimitKib: () => speedLimitKib,
		runSetup: async () => {},
		onChange: (list) => {
			latest = list;
		},
		onInstalled: (item) => void installed.push(item),
	});
	downloads.start();
	const item = { gameId: 1, versionId: 1, title: "Pixel: Drift?", version: "v1.2.0", type: "WINDOWS_PORTABLE" as const, totalBytes: archive.length, fileName: "Pixel Drift (v1.2.0).zip" };
	const dir = gameDir(folder, item.title, item.gameId);
	return { folder, dir, item, downloads, installs, installed, state: () => latest, setLimit: (kib: number) => { speedLimitKib = kib; } };
}

async function until(condition: () => boolean, what: string) {
	for (let i = 0; i < 1000; i++) {
		if (condition()) return;
		await Bun.sleep(10);
	}
	throw new Error(`Timed out waiting for ${what}`);
}

function expectInstalled(dir: string) {
	expect(readFileSync(join(filesDir(dir), "data", "assets.bin")).equals(big)).toBe(true);
	expect(existsSync(join(filesDir(dir), "Game.exe"))).toBe(true);
	// The archive is gone once it has been extracted.
	expect(existsSync(join(workDir(dir), "download"))).toBe(false);
}

test("folder names are safe on every OS", () => {
	expect(safeName('Pixel: Drift? <2> "x" ')).toBe("Pixel Drift 2 x");
	expect(safeName("...")).toBe("Game");
	expect(safeName("a".repeat(200)).length).toBe(80);
});

test("downloads, extracts and records the install", async () => {
	const t = setup("plain");
	await t.downloads.enqueue(t.item, t.folder);
	await until(() => t.installed.length === 1, "install");
	expectInstalled(t.dir);
	expect(t.state()).toEqual([]);
	const entry = t.installs.get(1)!;
	expect(entry.manifest).toMatchObject({ gameId: 1, versionId: 1, version: "v1.2.0", title: "Pixel: Drift?", serverUrl: "http://gv" });
	expect(entry.manifest.sizeBytes).toBeGreaterThan(big.length);

	// A fresh scan of the library folder finds it again, with nothing else stored.
	const rescanned = new Installs(() => {});
	rescanned.scan([t.folder], "http://gv");
	expect(rescanned.get(1)?.dir).toBe(t.dir);
	rescanned.scan([t.folder], "http://another-server");
	expect(rescanned.get(1)).toBeUndefined();
});

test("a paused download keeps its file and resumes from where it stopped", async () => {
	const t = setup("resume");
	requests.length = 0;
	await t.downloads.enqueue(t.item, t.folder);
	await until(() => (t.state()[0]?.progress ?? 0) > 0.2, "some progress");
	t.downloads.setPaused(1, true);
	await until(() => t.state()[0]?.paused === true && t.state()[0].bytesPerSecond === 0, "pause");
	await Bun.sleep(60);

	const part = join(workDir(t.dir), "download", `${t.item.fileName}.part`);
	const kept = statSync(part).size;
	expect(kept).toBeGreaterThan(0);
	expect(kept).toBeLessThan(archive.length);
	// Paused items still show how far they got.
	expect(t.state()[0].receivedBytes).toBe(kept);

	t.downloads.setPaused(1, false);
	await until(() => t.installed.length === 1, "install after resume");
	expect(requests.at(-1)?.range).toBe(`bytes=${kept}-`);
	expectInstalled(t.dir);
});

test("starts over when the server ignores the range", async () => {
	const t = setup("norange");
	await t.downloads.enqueue(t.item, t.folder);
	await until(() => (t.state()[0]?.progress ?? 0) > 0.2, "some progress");
	t.downloads.setPaused(1, true);
	await until(() => t.state()[0]?.paused === true, "pause");
	await Bun.sleep(60);
	honourRange = false;
	try {
		t.downloads.setPaused(1, false);
		await until(() => t.installed.length === 1, "install after restart");
		expectInstalled(t.dir);
	} finally {
		honourRange = true;
	}
});

test("a new speed limit restarts the transfer with the limit applied", async () => {
	const t = setup("limit");
	requests.length = 0;
	await t.downloads.enqueue(t.item, t.folder);
	await until(() => (t.state()[0]?.progress ?? 0) > 0.1, "some progress");
	t.setLimit(512);
	t.downloads.speedLimitChanged();
	await until(() => t.installed.length === 1, "install");
	expect(requests.map((r) => r.limit)).toEqual([null, "512"]);
	expect(requests[1].range).toMatch(/^bytes=\d+-$/);
	expectInstalled(t.dir);
});

test("removing a download deletes its files and lets the next one run", async () => {
	const t = setup("remove");
	requests.length = 0;
	await t.downloads.enqueue(t.item, t.folder);
	await t.downloads.enqueue({ ...t.item, gameId: 2, title: "Second" }, t.folder);
	await until(() => (t.state()[0]?.progress ?? 0) > 0.1, "some progress");
	expect(t.state().map((d) => d.gameId)).toEqual([1, 2]);
	await t.downloads.remove(1);
	expect(existsSync(t.dir)).toBe(false);
	await until(() => t.installed.length === 1, "second install");
	expect(t.installed[0].gameId).toBe(2);
	// Stopping it didn't start it again on its way out of the queue.
	expect(requests.filter((r) => r.url.startsWith("/api/game/1/"))).toHaveLength(1);
	expect(existsSync(t.dir)).toBe(false);
});

test("the queue survives a restart", async () => {
	const t = setup("restart");
	await t.downloads.enqueue(t.item, t.folder);
	await until(() => (t.state()[0]?.progress ?? 0) > 0.2, "some progress");
	t.downloads.setPaused(1, true);
	await until(() => t.state()[0]?.paused === true, "pause");
	await Bun.sleep(60);
	const saved = JSON.parse(readFileSync(join(t.folder, "queue.json"), "utf8"));
	expect(saved).toHaveLength(1);
	expect(saved[0]).toMatchObject({ gameId: 1, paused: true, dir: t.dir });
	expect(saved[0].receivedBytes).toBeGreaterThan(0);
});
