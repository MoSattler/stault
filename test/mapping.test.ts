import { expect, test } from "bun:test";
import { toDetail, toSummary, userGameData } from "../src/bun/gamevault/mapping";
import type { ApiGame } from "../src/bun/gamevault/types";
import { canRun } from "../src/shared/compat";

const game: ApiGame = {
	id: 3,
	created_at: "2026-11-21T14:18:25.000Z",
	title: "Pixel Drift",
	sort_title: "pixel drift",
	version: "v1.2.0",
	size: "504",
	release_date: "2023-01-01T00:00:00.000Z",
	early_access: false,
	type: "WINDOWS_PORTABLE",
	metadata: null,
	versions: [
		{ id: 3, file_path: "/files/a.zip", version: "v1.1.0", size: "187", early_access: false, type: "WINDOWS_PORTABLE" },
		{ id: 4, file_path: "/files/b.zip", version: "v1.2.0", size: "504", early_access: false, type: "WINDOWS_PORTABLE" },
	],
};
const mediaUrl = (id: number) => `media:${id}`;

test("a game without metadata still maps to something showable", () => {
	const user = userGameData({ id: 1, username: "sam" });
	expect(toSummary(game, user, mediaUrl)).toMatchObject({
		title: "Pixel Drift",
		coverUrl: null,
		genres: [],
		releaseYear: 2023,
		sizeBytes: 504,
		minutesPlayed: 0,
		progressState: "UNPLAYED",
		bookmarked: false,
	});
});

test("progress and bookmarks come from the user record", () => {
	const user = userGameData({
		id: 1,
		username: "sam",
		progresses: [{ minutes_played: 90, state: "PLAYING", last_played_at: "2026-11-20T10:00:00.000Z", game: { id: 3 } }],
		bookmarked_games: [{ id: 3 }],
	});
	expect(toSummary(game, user, mediaUrl)).toMatchObject({ minutesPlayed: 90, progressState: "PLAYING", bookmarked: true });
});

test("metadata supplies title, art and genres", () => {
	const withMeta: ApiGame = {
		...game,
		metadata: {
			title: "Pixel Drift Deluxe", description: "Drift.", release_date: "2024-05-01T00:00:00.000Z",
			cover: { id: 11 }, background: { id: 12 },
			launch_executable: null, launch_parameters: null, installer_executable: null, installer_parameters: null,
			umu_game_id: null, umu_store: null, umu_proton_path: null,
			genres: [{ name: "Racing" }], developers: [{ name: "Halfstep" }],
		},
	};
	const detail = toDetail(withMeta, userGameData({ id: 1, username: "sam" }), mediaUrl);
	expect(detail).toMatchObject({ title: "Pixel Drift Deluxe", coverUrl: "media:11", backgroundUrl: "media:12", genres: ["Racing"], developers: ["Halfstep"], releaseYear: 2024, description: "Drift." });
});

test("versions list the server default first, then newest to oldest", () => {
	const detail = toDetail(game, userGameData({ id: 1, username: "sam" }), mediaUrl);
	expect(detail.versions.map((v) => v.version)).toEqual(["v1.2.0", "v1.1.0"]);
});

test("which builds run where", () => {
	expect(canRun("windows", "WINDOWS_SETUP")).toBe("yes");
	expect(canRun("windows", "LINUX_PORTABLE")).toBe("no");
	expect(canRun("linux", "WINDOWS_PORTABLE")).toBe("yes");
	expect(canRun("linux", "LINUX_PORTABLE")).toBe("yes");
	expect(canRun("macos", "WINDOWS_PORTABLE")).toBe("no");
	expect(canRun("macos", "LINUX_PORTABLE")).toBe("no");
	// Mac builds are indexed as undetectable, so they stay installable everywhere.
	expect(canRun("macos", "UNDETECTABLE")).toBe("maybe");
});
