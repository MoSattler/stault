// Runs against the local test server (./dev/seed.sh). Skipped when it is not up.

import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Library } from "../src/bun/library";
import { MediaProxy } from "../src/bun/media";
import type { SecretStore } from "../src/bun/secrets";
import { Session } from "../src/bun/session";
import { SettingsFile } from "../src/bun/settings";
import { getState } from "../src/bun/state";

const seed = readFileSync(join(import.meta.dir, "..", "dev", "seed.sh"), "utf8");
const read = (name: string) => seed.match(new RegExp(`^${name}=(.*)$`, "m"))![1];
const SERVER = read("SERVER");
const status = await fetch(`${SERVER}/api/status`).then((r) => r.json(), () => null);
const up = !!status;
const sso: boolean = up && status.available_authentication_methods?.includes("sso");

const dir = mkdtempSync(join(tmpdir(), "stault-session-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function boot() {
	const stored = new Map<string, string>();
	const secrets: SecretStore = {
		get: async (name) => stored.get(name) ?? null,
		set: async (name, value) => void stored.set(name, value),
		delete: async (name) => void stored.delete(name),
	};
	const events: string[] = [];
	/** What the system browser does with a page it is asked to open. */
	const browser = { open: (_url: string) => {} };
	const make = () => {
		const settings = new SettingsFile(join(dir, "settings.json"), {
			account: null, lastSignIn: null, deviceName: "Test rig", libraryFolders: [], speedLimitKib: 0, saveSync: true,
		});
		const media = new MediaProxy(join(dir, "media"));
		// Linux runs every sample build, so no versions get fetched in the background.
		const library = new Library(join(dir, "library.json"), media, "linux");
		return new Session(settings, secrets, media, library, {
			signedIn: (url) => void events.push(`in ${url}`),
			signingOut: async () => void events.push("out"),
			openBrowser: (url) => {
				browser.open(url);
				return true;
			},
		});
	};
	return { make, stored, events, browser };
}

/**
 * Plays the system browser through a single sign-on: it follows the redirects
 * from the server to its identity provider, which signs the test account in by
 * itself, and back to Stault. Keeps cookies, which the server's login needs.
 */
async function browse(url: string) {
	const cookies = new Map<string, string>();
	let next: string | null = url;
	for (let hop = 0; next && hop < 10; hop++) {
		const response: Response = await fetch(next, {
			redirect: "manual",
			headers: { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") },
		});
		for (const line of response.headers.getSetCookie()) {
			const [name, value] = line.split(";")[0].split(/=(.*)/);
			cookies.set(name, value);
		}
		const location = response.headers.get("location");
		next = location ? new URL(location, next).href : null;
	}
}

test.skipIf(!up)("signs in, loads the library, restores on the next start, and signs out", async () => {
	const { make, stored, events } = boot();
	const session = make();

	expect(await session.check(SERVER)).toMatchObject({ ok: true });
	expect((await session.check("http://127.0.0.1:9")).ok).toBe(false);

	await expect(
		session.signIn({ serverUrl: SERVER, username: read("DEV_USER"), password: "not-it" }),
	).rejects.toThrow("Wrong username or password.");
	expect(getState().session).toBeNull();

	await session.signIn({ serverUrl: `${SERVER}/`, username: read("DEV_USER"), password: read("DEV_PASSWORD") });
	expect(getState().session).toMatchObject({ serverUrl: SERVER, username: read("DEV_USER") });
	expect(getState().games.map((g) => g.title)).toContain("Harbor Lights");
	expect(stored.size).toBe(1);
	expect(events).toEqual([`in ${SERVER}`]);

	// The detail record carries the versions the list leaves out.
	const drift = getState().games.find((g) => g.title === "Pixel Drift")!;
	const mac = new Library(join(dir, "other.json"), new MediaProxy(join(dir, "m2")), "macos");
	const detail = await mac.detail(session.client, drift.id);
	expect(detail.versions.map((v) => v.version)).toEqual(["v1.2.0", "v1.1.0"]);
	// On a Mac, where its Windows builds can't run, the library fetches them for the list too.
	await mac.refresh(session.client);
	await mac.fillVersions(session.client);
	expect(getState().games.find((g) => g.id === drift.id)?.versions?.map((v) => v.version)).toEqual(["v1.2.0", "v1.1.0"]);

	// A new process: only the settings file and the stored token carry over.
	const restored = make();
	await restored.restore();
	expect(getState().ready).toBe(true);
	expect(getState().session?.username).toBe(read("DEV_USER"));
	expect(getState().games.length).toBeGreaterThan(0);

	await restored.signOut();
	expect(getState().session).toBeNull();
	expect(getState().games).toEqual([]);
	expect(stored.size).toBe(0);
	expect(getState().lastSignIn).toEqual({ serverUrl: SERVER, username: read("DEV_USER") });
});

test.skipIf(!sso)("signs in through single sign-on in the browser, and not at all when called off", async () => {
	const { make, stored, events, browser } = boot();
	const session = make();
	expect(await session.check(SERVER)).toMatchObject({ ok: true, methods: ["basic", "sso"] });

	// The user gives up while the browser is still open.
	browser.open = () => setTimeout(() => session.cancelSso(), 50);
	expect(await session.signInWithSso({ serverUrl: SERVER })).toBe(false);
	expect(getState().session).toBeNull();
	expect(stored.size).toBe(0);
	expect(events).toEqual([]);

	browser.open = (url) => void browse(url);
	expect(await session.signInWithSso({ serverUrl: SERVER })).toBe(true);
	expect(getState().session).toMatchObject({ serverUrl: SERVER, username: read("DEV_USER") });
	expect(getState().games.length).toBeGreaterThan(0);
	expect([...stored.keys()]).toEqual([`${SERVER}#${read("DEV_USER")}`]);
	expect(events).toEqual([`in ${SERVER}`]);

	// The stored token is the one that keeps the session going after a restart.
	const restored = make();
	await restored.restore();
	expect(getState().session?.username).toBe(read("DEV_USER"));
	await restored.signOut();
	expect(stored.size).toBe(0);
});
