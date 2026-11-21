import type {
	GameDetail,
	GameSummary,
	GameVersion,
	ProgressState,
} from "../../shared/model";
import type { ApiGame, ApiUser, ApiVersion } from "./types";

/** What the signed-in user has done with each game, keyed by game id. */
export interface UserGameData {
	progress: Map<number, { minutes: number; lastPlayedAt: string | null; state: ProgressState }>;
	bookmarks: Set<number>;
}

export function userGameData(user: ApiUser): UserGameData {
	const progress: UserGameData["progress"] = new Map();
	for (const p of user.progresses ?? []) {
		if (!p.game) continue;
		progress.set(p.game.id, {
			minutes: p.minutes_played,
			lastPlayedAt: p.last_played_at,
			state: p.state,
		});
	}
	return {
		progress,
		bookmarks: new Set((user.bookmarked_games ?? []).map((g) => g.id)),
	};
}

const bytes = (size: string) => Number(size) || 0;

function toVersion(v: ApiVersion): GameVersion {
	return {
		id: v.id,
		version: v.version,
		type: v.type,
		sizeBytes: bytes(v.size),
		earlyAccess: v.early_access,
	};
}

export function toSummary(
	game: ApiGame,
	user: UserGameData,
	mediaUrl: (mediaId: number) => string,
): GameSummary {
	const meta = game.metadata;
	const progress = user.progress.get(game.id);
	const released = meta?.release_date ?? game.release_date;
	return {
		id: game.id,
		title: meta?.title || game.title,
		sortTitle: game.sort_title || game.title.toLowerCase(),
		coverUrl: meta?.cover ? mediaUrl(meta.cover.id) : null,
		backgroundUrl: meta?.background ? mediaUrl(meta.background.id) : null,
		genres: (meta?.genres ?? []).map((g) => g.name),
		developers: (meta?.developers ?? []).map((d) => d.name),
		releaseYear: released ? new Date(released).getFullYear() : null,
		addedAt: game.created_at,
		version: game.version,
		type: game.type,
		sizeBytes: bytes(game.size),
		minutesPlayed: progress?.minutes ?? 0,
		lastPlayedAt: progress?.lastPlayedAt ?? null,
		progressState: progress?.state ?? "UNPLAYED",
		bookmarked: user.bookmarks.has(game.id),
	};
}

export function toDetail(
	game: ApiGame,
	user: UserGameData,
	mediaUrl: (mediaId: number) => string,
): GameDetail {
	const versions = (game.versions ?? []).map(toVersion);
	// The server lists versions oldest first; its default is the one whose label
	// matches the game's own. Put that first, then newest to oldest.
	versions.reverse();
	const defaultIndex = versions.findIndex(
		(v) => v.version === game.version && v.type === game.type,
	);
	if (defaultIndex > 0) versions.unshift(...versions.splice(defaultIndex, 1));
	return {
		...toSummary(game, user, mediaUrl),
		description: game.metadata?.description ?? null,
		versions,
	};
}
