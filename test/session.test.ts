// Runs against the local test server (./dev/seed.sh). Skipped when it is not up.

import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GameVaultClient } from "../src/bun/gamevault/client";
import type { ApiTokens } from "../src/bun/gamevault/types";
import { Library } from "../src/bun/library";
import { MediaProxy } from "../src/bun/media";
import type { SecretStore } from "../src/bun/secrets";
import { Session } from "../src/bun/session";
import { SettingsFile } from "../src/bun/settings";
import { getState } from "../src/bun/state";

const seed = readFileSync(join(import.meta.dir, "..", "dev", "seed.sh"), "utf8");
const read = (name: string) => seed.match(new RegExp(`^${name}=(.*)$`, "m"))![1];
const SERVER = read("SERVER");
const up = await fetch(`${SERVER}/api/status`).then((r) => r.ok, () => false);

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
	/** What the login window would hand back: tokens, or null for a window the user closed. */
	const sso: { tokens: ApiTokens | null } = { tokens: null };
	const make = () => {
		const settings = new SettingsFile(join(dir, "settings.json"), {
			account: null, lastSignIn: null, deviceName: "Test rig", libraryFolders: [], speedLimitKib: 0, saveSync: true,
		});
		const media = new MediaProxy(join(dir, "media"));
		const library = new Library(join(dir, "library.json"), media);
		return new Session(settings, secrets, media, library, {
			signedIn: (url) => void events.push(`in ${url}`),
			signingOut: async () => void events.push("out"),
			ssoLogin: async () => sso.tokens,
		});
	};
	return { make, stored, events, sso };
}

test.skipIf(!up)("signs in, loads the library, restores on the next start, and signs out", async () => {
	const { make, stored, events } = boot();
	const session = make();

	expect(await session.check(SERVER)).toMatchObject({ ok: true });
	expect((await session.check("http://127.0.0.1:9")).ok).toBe(false);

	await expect(
		session.signIn({ serverUrl: SERVER, username: read("DEV_USER"), password: "not-it", deviceName: "" }),
	).rejects.toThrow("Wrong username or password.");
	expect(getState().session).toBeNull();

	await session.signIn({ serverUrl: `${SERVER}/`, username: read("DEV_USER"), password: read("DEV_PASSWORD"), deviceName: "Rig" });
	expect(getState().session).toMatchObject({ serverUrl: SERVER, username: read("DEV_USER") });
	expect(getState().deviceName).toBe("Rig");
	expect(getState().games.map((g) => g.title)).toContain("Harbor Lights");
	expect(stored.size).toBe(1);
	expect(events).toEqual([`in ${SERVER}`]);

	// The detail record carries the versions the list leaves out.
	const drift = getState().games.find((g) => g.title === "Pixel Drift")!;
	const detail = await new Library(join(dir, "other.json"), new MediaProxy(join(dir, "m2"))).detail(session.client, drift.id);
	expect(detail.versions.map((v) => v.version)).toEqual(["v1.2.0", "v1.1.0"]);

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

test.skipIf(!up)("signs in with the tokens of a single sign-on, and not at all when the window is closed", async () => {
	const { make, stored, events, sso } = boot();
	const session = make();

	expect(await session.signInWithSso({ serverUrl: SERVER, deviceName: "" })).toBe(false);
	expect(getState().session).toBeNull();
	expect(stored.size).toBe(0);
	expect(events).toEqual([]);

	// The test server has no identity provider to visit; its tokens are the same either way.
	await new GameVaultClient(SERVER, null, { onTokens: (tokens) => void (sso.tokens = tokens) })
		.login(read("DEV_USER"), read("DEV_PASSWORD"));

	expect(await session.signInWithSso({ serverUrl: SERVER, deviceName: "Rig" })).toBe(true);
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
