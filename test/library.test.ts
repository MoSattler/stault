import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GameVaultClient } from "../src/bun/gamevault/client";
import type { ApiGame, ApiVersion } from "../src/bun/gamevault/types";
import { Library } from "../src/bun/library";
import type { MediaProxy } from "../src/bun/media";
import { getState } from "../src/bun/state";

const dir = mkdtempSync(join(tmpdir(), "stault-library-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const media = { url: (id: number) => `media:${id}` } as unknown as MediaProxy;

let nextVersion = 1;
const build = (type: ApiVersion["type"], version: string): ApiVersion => ({
	id: nextVersion,
	file_path: `/files/${nextVersion++}.zip`,
	version,
	size: "100",
	early_access: false,
	type,
});

/** A game record as the detail endpoint returns it. The first build is the server's default. */
function game(id: number, ...versions: ApiVersion[]): ApiGame {
	return {
		id,
		created_at: "2026-11-01T00:00:00.000Z",
		updated_at: "2026-11-01T00:00:00.000Z",
		title: `Game ${id}`,
		sort_title: null,
		version: versions[0].version,
		size: versions[0].size,
		release_date: null,
		early_access: false,
		type: versions[0].type,
		metadata: null,
		versions,
	};
}

/** A server whose game list leaves out versions, like GameVault's. `held` answers only when released. */
function server(games: ApiGame[], held?: { id: number; until: Promise<void> }) {
	const fetched: number[] = [];
	const client = {
		games: async () => games.map((g) => ({ ...g, versions: [] })),
		me: async () => ({ id: 1, username: "sam" }),
		game: async (id: number) => {
			fetched.push(id);
			if (id === held?.id) await held.until;
			return games.find((g) => g.id === id)!;
		},
	} as unknown as GameVaultClient;
	return { client, fetched };
}

const versions = (id: number) => getState().games.find((g) => g.id === id)?.versions?.map((v) => v.version);

test("fetches the versions of games whose default can't run here, and keeps them", async () => {
	const games = [
		// Linux by default, but with a Mac build: installable on a Mac.
		game(1, build("LINUX_PORTABLE", "v5.4"), build("UNDETECTABLE", "v5.4 · macOS")),
		game(2, build("WINDOWS_PORTABLE", "v4.0")),
		game(3, build("UNDETECTABLE", "v1.0 · macOS")),
		game(4, build("UNDETECTABLE", "v1.0")),
	];
	const { client, fetched } = server(games);
	const path = join(dir, "kept.json");
	const library = new Library(path, media, "macos");

	await library.refresh(client);
	expect(versions(1)).toBeUndefined();
	await library.fillVersions(client);
	expect(fetched.sort()).toEqual([1, 2]);
	expect(versions(1)).toEqual(["v5.4", "v5.4 · macOS"]);
	expect(versions(2)).toEqual(["v4.0"]);
	expect(versions(3)).toBeUndefined();
	expect(versions(4)).toBeUndefined();
	const cached: ApiGame[] = JSON.parse(readFileSync(path, "utf8")).games;
	expect(cached.find((g) => g.id === 1)?.versions).toHaveLength(2);

	// Unchanged games keep them through a refresh; a changed one is fetched again.
	games[1].updated_at = "2026-11-02T00:00:00.000Z";
	await library.refresh(client);
	expect(versions(1)).toHaveLength(2);
	expect(versions(2)).toBeUndefined();
	await library.fillVersions(client);
	expect(fetched.sort()).toEqual([1, 2, 2]);
	expect(versions(2)).toEqual(["v4.0"]);
});

test("a sign-out during the fetch leaves nothing behind", async () => {
	let release = () => {};
	const until = new Promise<void>((resolve) => (release = resolve));
	const { client } = server(
		[game(11, build("WINDOWS_PORTABLE", "v1")), game(12, build("WINDOWS_PORTABLE", "v2"))],
		{ id: 12, until },
	);
	const path = join(dir, "signed-out.json");
	const library = new Library(path, media, "macos");
	await library.refresh(client);

	const filling = library.fillVersions(client);
	await Bun.sleep(0); // Game 11 is in; game 12 is still on its way.
	library.clear();
	release();
	await filling;

	expect(getState().games).toEqual([]);
	expect(JSON.parse(readFileSync(path, "utf8"))).toBeNull();
	expect(library.raw(12)).toBeUndefined();
});

test("opening a game's page fills in its versions", async () => {
	const { client, fetched } = server([game(21, build("WINDOWS_SETUP", "v3"), build("WINDOWS_PORTABLE", "v2"))]);
	const library = new Library(join(dir, "detail.json"), media, "windows");
	await library.refresh(client);
	await library.fillVersions(client);
	expect(fetched).toEqual([]);
	expect(versions(21)).toBeUndefined();

	const detail = await library.detail(client, 21);
	expect(detail.versions).toHaveLength(2);
	expect(versions(21)).toEqual(["v3", "v2"]);
	expect(library.raw(21)?.versions?.map((v) => v.file_path)).toHaveLength(2);
});
