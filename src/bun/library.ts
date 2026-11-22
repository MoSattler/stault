import type { GameDetail, GameSummary } from "../shared/model";
import type { GameVaultClient } from "./gamevault/client";
import {
	toDetail,
	toSummary,
	userGameData,
	type UserGameData,
} from "./gamevault/mapping";
import type { ApiGame, ApiProgress, ApiUser } from "./gamevault/types";
import { readJson, writeJson } from "./json-file";
import type { MediaProxy } from "./media";
import { patchState } from "./state";

interface Cache {
	games: ApiGame[];
	user: Pick<ApiUser, "progresses">;
}

/** The server's game list plus what this user did with it. Cached for offline starts. */
export class Library {
	private games = new Map<number, ApiGame>();
	private user: UserGameData = { progress: new Map() };

	constructor(
		private readonly cachePath: string,
		private readonly media: MediaProxy,
	) {}

	/** Raw server record, for the launcher's metadata lookups. */
	raw(gameId: number): ApiGame | undefined {
		return this.games.get(gameId);
	}

	private summaries(): GameSummary[] {
		return [...this.games.values()].map((g) => toSummary(g, this.user, this.media.url));
	}

	private adopt(cache: Cache) {
		this.games = new Map(cache.games.map((g) => [g.id, g]));
		this.user = userGameData({ id: 0, username: "", ...cache.user });
		patchState({ games: this.summaries(), gamesLoaded: true });
	}

	/** Shows the last known library straight away, before the server answers. */
	loadCache() {
		const cache = readJson<Cache | null>(this.cachePath, null);
		if (cache) this.adopt(cache);
	}

	async refresh(client: GameVaultClient) {
		const [games, me] = await Promise.all([client.games(), client.me()]);
		const cache: Cache = {
			games,
			user: {
				// The server embeds the whole game in each progress; keep only its id.
				progresses: (me.progresses ?? []).map((p) => ({
					minutes_played: p.minutes_played,
					state: p.state,
					last_played_at: p.last_played_at,
					game: p.game && { id: p.game.id },
				})),
			},
		};
		this.adopt(cache);
		writeJson(this.cachePath, cache);
	}

	async detail(client: GameVaultClient, gameId: number): Promise<GameDetail> {
		const game = await client.game(gameId);
		// The detail record also carries the version list; keep it for installs.
		this.games.set(gameId, game);
		return toDetail(game, this.user, this.media.url);
	}

	/** Applies a progress record the server just returned. */
	applyProgress(gameId: number, progress: ApiProgress) {
		this.user.progress.set(gameId, {
			minutes: progress.minutes_played,
			lastPlayedAt: progress.last_played_at,
			state: progress.state,
		});
		patchState({ games: this.summaries() });
	}

	clear() {
		this.games.clear();
		this.user = { progress: new Map() };
		writeJson(this.cachePath, null);
		patchState({ games: [], gamesLoaded: false });
	}
}
