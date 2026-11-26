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

/** A save on the server: when it was uploaded, and by which install of the game. */
export interface ServerSave {
	uploadedAt: number;
	installationId: string;
}

/** The server names a save "<upload time in ms>_<installation id>.zip". */
export function parseSaveName(contentDisposition: string | null): ServerSave | null {
	const match = contentDisposition?.match(/filename="?(\d+)_([0-9a-f-]+)\.zip/i);
	return match ? { uploadedAt: Number(match[1]), installationId: match[2] } : null;
}

/**
 * Finds the GameVault server behind what the user typed. An address without
 * a scheme is tried over HTTPS first, then plain HTTP (common on a home LAN).
 */
export async function findServer(
	input: string,
	fetchImpl: Fetch = fetch,
): Promise<{ serverUrl: string; status: ApiStatus }> {
	const typed = input.trim();
	const first = normalizeServerUrl(typed);
	const candidates = /^https?:\/\//i.test(typed)
		? [first]
		: [first, first.replace(/^https:/, "http:")];
	let failure: unknown;
	for (const serverUrl of candidates) {
		try {
			return { serverUrl, status: await GameVaultClient.status(serverUrl, fetchImpl) };
		} catch (error) {
			failure ??= error;
		}
	}
	throw failure;
}

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

	/**
	 * Whether the server hands a single sign-on back to an app on this device:
	 * GameVault 17.3 and newer do, unless AUTH_OAUTH2_LOOPBACK_RETURN_ENABLED is
	 * off. /api/status doesn't say, so this starts such a login without its PKCE
	 * challenge. A server that takes them turns that down (400) before it sends
	 * anyone to the identity provider; any other answers with that redirect.
	 */
	static async ssoReturnsToApps(serverUrl: string, fetchImpl: Fetch = fetch): Promise<boolean> {
		const origin = encodeURIComponent("http://127.0.0.1:1");
		let response: Response;
		try {
			response = await fetchImpl(`${serverUrl}/api/auth/oauth2/login?client_origin=${origin}`, {
				redirect: "manual",
				signal: AbortSignal.timeout(8000),
			});
		} catch {
			throw new OfflineError(serverUrl);
		}
		return response.status === 400;
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

	/** Continues with a token pair, from this server or from another client's sign-in. */
	async adopt(tokens: ApiTokens): Promise<void> {
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
		await this.adopt(await response.json());
	}

	/**
	 * Finishes a single sign-on: trades the one-time code the browser brought
	 * back, with the PKCE verifier its login was started with (GameVault 17.3).
	 */
	async redeemLoginCode(code: string, verifier: string): Promise<void> {
		const response = await this.send("/api/auth/oauth2/token", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code, code_verifier: verifier }),
		});
		if (!response.ok) throw await errorFrom(response);
		await this.adopt(await response.json());
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
			await this.adopt(await response.json());
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

	/**
	 * The newest save the server holds for a game, without downloading it.
	 * Null when there is none. A server with save files switched off answers 405.
	 */
	async newestSave(userId: number, gameId: number, signal?: AbortSignal): Promise<ServerSave | null> {
		try {
			const response = await this.request(`/api/savefiles/user/${userId}/game/${gameId}`, {
				method: "HEAD",
				signal,
			});
			return parseSaveName(response.headers.get("Content-Disposition"));
		} catch (error) {
			if (error instanceof ApiError && error.status === 404) return null;
			throw error;
		}
	}

	/** Downloads the newest save: a zip, named as parseSaveName() expects. */
	downloadSave(userId: number, gameId: number, signal?: AbortSignal): Promise<Response> {
		return this.request(`/api/savefiles/user/${userId}/game/${gameId}`, { signal });
	}

	/** Uploads a save, which becomes the newest. The server keeps a few older ones. */
	async uploadSave(userId: number, gameId: number, zip: Blob, installationId: string): Promise<void> {
		const body = new FormData();
		body.append("file", zip, "save.zip");
		await this.request(`/api/savefiles/user/${userId}/game/${gameId}`, {
			method: "POST",
			headers: { "X-Installation-Id": installationId },
			body,
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
