import { canRun } from "../shared/compat";
import type { GameDetail, GameSummary, Platform } from "../shared/model";
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
	/** The server's list records, with versions where they were fetched. */
	games: ApiGame[];
	user: Pick<ApiUser, "progresses">;
}

/** How many game records `fillVersions` asks for at once. */
const PARALLEL = 4;

/** The server's game list plus what this user did with it. Cached for offline starts. */
export class Library {
	private games = new Map<number, ApiGame>();
	private user: UserGameData = { progress: new Map() };
	private userRecord: Cache["user"] = {};

	constructor(
		private readonly cachePath: string,
		private readonly media: MediaProxy,
		private readonly platform: Platform,
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
		this.userRecord = cache.user;
		this.user = userGameData({ id: 0, username: "", ...cache.user });
		patchState({ games: this.summaries(), gamesLoaded: true });
	}

	private save() {
		const cache: Cache = { games: [...this.games.values()], user: this.userRecord };
		writeJson(this.cachePath, cache);
	}

	/** Shows the last known library straight away, before the server answers. */
	loadCache() {
		const cache = readJson<Cache | null>(this.cachePath, null);
		if (cache) this.adopt(cache);
	}

	async refresh(client: GameVaultClient) {
		const [games, me] = await Promise.all([client.games(), client.me()]);
		this.adopt({
			// The list leaves out versions. Keep the ones fetched before while the game is unchanged.
			games: games.map((game) => {
				const known = this.games.get(game.id);
				return known?.versions?.length && known.updated_at === game.updated_at
					? { ...game, versions: known.versions }
					: game;
			}),
			user: {
				// The server embeds the whole game in each progress; keep only its id.
				progresses: (me.progresses ?? []).map((p) => ({
					minutes_played: p.minutes_played,
					state: p.state,
					last_played_at: p.last_played_at,
					game: p.game && { id: p.game.id },
				})),
			},
		});
		this.save();
	}

	/**
	 * The game list only names each game's default version. Where that one can't
	 * run here another might, so this fetches those games' versions. A failed
	 * request ends the round; the next refresh tries again.
	 */
	async fillVersions(client: GameVaultClient) {
		const games = this.games;
		const queue = [...games.values()].filter(
			(g) => !g.versions?.length && canRun(this.platform, g.type, g.version) === "no",
		);
		let filled = 0;
		const work = async () => {
			for (let game = queue.shift(); game; game = queue.shift()) {
				try {
					const { versions } = await client.game(game.id);
					// A refresh or a sign-out in the meantime replaced the record.
					if (this.games.get(game.id) !== game || !versions?.length) continue;
					this.games.set(game.id, { ...game, versions });
					filled++;
				} catch {
					queue.length = 0;
				}
			}
		};
		await Promise.all(Array.from({ length: PARALLEL }, work));
		if (filled && this.games === games) {
			patchState({ games: this.summaries() });
			this.save();
		}
	}

	async detail(client: GameVaultClient, gameId: number): Promise<GameDetail> {
		const game = await client.game(gameId);
		// The detail record carries the versions the list leaves out: keep them for installs and the list.
		const known = this.games.get(gameId);
		if (known && JSON.stringify(known.versions) !== JSON.stringify(game.versions)) {
			this.games.set(gameId, { ...known, versions: game.versions });
			patchState({ games: this.summaries() });
		}
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
		// A new map, so a fill still under way can tell its records are gone.
		this.games = new Map();
		this.user = { progress: new Map() };
		this.userRecord = {};
		writeJson(this.cachePath, null);
		patchState({ games: [], gamesLoaded: false });
	}
}
