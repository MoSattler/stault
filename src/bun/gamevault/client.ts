import type { ProgressState } from "../../shared/model";
import type {
	ApiGame,
	ApiPage,
	ApiProgress,
	ApiStatus,
	ApiTokens,
	ApiUser,
} from "./types";

/** The server answered with an error status. */
export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

/** The server could not be reached at all. */
export class OfflineError extends Error {
	constructor(readonly serverUrl: string) {
		super(`Can't reach ${new URL(serverUrl).host}.`);
	}
}

/** The refresh token is no longer accepted; the user has to sign in again. */
export class SignedOutError extends Error {
	constructor() {
		super("Your session has ended. Sign in again.");
	}
}

/** "vault.lan/" → "https://vault.lan". Throws on something that isn't an address. */
export function normalizeServerUrl(input: string): string {
	let url = input.trim();
	if (!url) throw new Error("Enter your server's address.");
	if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
	const parsed = new URL(url);
	const path = parsed.pathname.replace(/\/+$/, "").replace(/\/api$/, "");
	return `${parsed.protocol}//${parsed.host}${path}`;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClientHooks {
	/** Called with every new token pair. Must persist the refresh token. */
	onTokens(tokens: ApiTokens): void | Promise<void>;
	/** Called whenever a request shows the server is reachable or not. */
	onOnline?(online: boolean): void;
}

async function errorFrom(response: Response): Promise<ApiError> {
	let message = `The server answered ${response.status}.`;
	try {
		const body = (await response.json()) as { message?: string | string[] };
		if (body.message) message = [body.message].flat().join(" ");
	} catch {
		// Not JSON: keep the generic message.
	}
	return new ApiError(response.status, message);
}

export class GameVaultClient {
	private accessToken: string | null = null;
	private refreshing: Promise<void> | null = null;

	constructor(
		readonly serverUrl: string,
		private refreshToken: string | null,
		private readonly hooks: ClientHooks,
		private readonly fetchImpl: Fetch = fetch,
	) {}

	/** Public endpoint: tells whether a GameVault server lives at this address. */
	static async status(serverUrl: string, fetchImpl: Fetch = fetch): Promise<ApiStatus> {
		let response: Response;
		try {
			response = await fetchImpl(`${serverUrl}/api/status`, {
				signal: AbortSignal.timeout(8000),
			});
		} catch {
			throw new OfflineError(serverUrl);
		}
		if (!response.ok) throw await errorFrom(response);
		const status = (await response.json()) as ApiStatus;
		if (typeof status.version !== "string") {
			throw new Error("That address answered, but not like a GameVault server.");
		}
		return status;
	}

	private async send(path: string, init: RequestInit): Promise<Response> {
		try {
			const response = await this.fetchImpl(`${this.serverUrl}${path}`, init);
			this.hooks.onOnline?.(true);
			return response;
		} catch (error) {
			if (init.signal?.aborted) throw error;
			this.hooks.onOnline?.(false);
			throw new OfflineError(this.serverUrl);
		}
	}

	private async acceptTokens(response: Response): Promise<void> {
		const tokens = (await response.json()) as ApiTokens;
		this.accessToken = tokens.access_token;
		this.refreshToken = tokens.refresh_token;
		await this.hooks.onTokens(tokens);
	}

	async login(username: string, password: string): Promise<void> {
		const basic = Buffer.from(`${username}:${password}`).toString("base64");
		const response = await this.send("/api/auth/basic/login", {
			headers: { Authorization: `Basic ${basic}` },
		});
		if (response.status === 401) throw new ApiError(401, "Wrong username or password.");
		if (!response.ok) throw await errorFrom(response);
		await this.acceptTokens(response);
	}

	/** Trades the refresh token for a new pair. Concurrent callers share one request. */
	private refresh(): Promise<void> {
		this.refreshing ??= (async () => {
			if (!this.refreshToken) throw new SignedOutError();
			const response = await this.send("/api/auth/refresh", {
				method: "POST",
				headers: { Authorization: `Bearer ${this.refreshToken}` },
			});
			if (response.status === 401 || response.status === 403) {
				this.refreshToken = null;
				throw new SignedOutError();
			}
			if (!response.ok) throw await errorFrom(response);
			await this.acceptTokens(response);
		})().finally(() => {
			this.refreshing = null;
		});
		return this.refreshing;
	}

	/** An authenticated request. Refreshes the 5-minute access token when needed. */
	async request(path: string, init: RequestInit = {}): Promise<Response> {
		if (!this.accessToken) await this.refresh();
		const run = () =>
			this.send(path, {
				...init,
				headers: { ...init.headers, Authorization: `Bearer ${this.accessToken}` },
			});
		let response = await run();
		if (response.status === 401) {
			await this.refresh();
			response = await run();
		}
		if (!response.ok) throw await errorFrom(response);
		return response;
	}

	private async json<T>(path: string, init?: RequestInit): Promise<T> {
		return (await this.request(path, init)).json() as Promise<T>;
	}

	me(): Promise<ApiUser> {
		return this.json("/api/users/me");
	}

	async games(): Promise<ApiGame[]> {
		const first = await this.json<ApiPage<ApiGame>>("/api/games?limit=-1");
		const games = first.data;
		// A server that caps the page size still gets read to the end.
		for (let page = 2; page <= first.meta.totalPages; page++) {
			const next = await this.json<ApiPage<ApiGame>>(`/api/games?limit=-1&page=${page}`);
			games.push(...next.data);
		}
		return games;
	}

	game(gameId: number): Promise<ApiGame> {
		return this.json(`/api/games/${gameId}`);
	}

	async setBookmark(gameId: number, on: boolean): Promise<void> {
		await this.request(`/api/users/me/bookmark/${gameId}`, {
			method: on ? "POST" : "DELETE",
		});
	}

	addMinutes(userId: number, gameId: number, minutes: number): Promise<ApiProgress> {
		return this.json(
			`/api/progresses/user/${userId}/game/${gameId}/increment/${minutes}`,
			{ method: "PUT" },
		);
	}

	setProgressState(userId: number, gameId: number, state: ProgressState): Promise<ApiProgress> {
		return this.json(`/api/progresses/user/${userId}/game/${gameId}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ state }),
		});
	}

	/** Names of helper programs (crash reporters, redistributables) that are never the game. */
	ignoredExecutables(): Promise<string[]> {
		return this.json("/api/progresses/ignorefile");
	}

	/** Starts (or resumes, from `offset`) the download of one version. */
	download(
		gameId: number,
		versionId: number,
		options: { offset: number; speedLimitKib: number; signal: AbortSignal },
	): Promise<Response> {
		const headers: Record<string, string> = {};
		if (options.offset > 0) headers.Range = `bytes=${options.offset}-`;
		if (options.speedLimitKib > 0) {
			headers["X-Download-Speed-Limit"] = String(options.speedLimitKib);
		}
		return this.request(`/api/game/${gameId}/versions/${versionId}`, {
			headers,
			signal: options.signal,
		});
	}

	media(mediaId: number): Promise<Response> {
		return this.request(`/api/media/${mediaId}`);
	}

	/** Ends the session on the server. Best effort: local sign-out happens regardless. */
	async revoke(): Promise<void> {
		if (!this.refreshToken) return;
		const refresh_token = this.refreshToken;
		this.refreshToken = null;
		try {
			await this.request("/api/auth/revoke", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ refresh_token }),
			});
		} catch {
			// Offline or already invalid: nothing more to do.
		}
		this.accessToken = null;
	}
}
