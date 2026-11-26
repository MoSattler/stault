import { findServer, GameVaultClient, SignedOutError } from "./gamevault/client";
import type { ApiStatus, ApiTokens } from "./gamevault/types";
import type { Library } from "./library";
import type { MediaProxy } from "./media";
import type { SecretStore } from "./secrets";
import type { SettingsFile } from "./settings";
import { browserSignIn } from "./sso";
import { getState, patchState } from "./state";
import type { ServerCheck, SignInMethod } from "../shared/model";

/** Oldest server whose API Stault is written against (versions, save files). */
const MIN_SERVER_MAJOR = 17;

function checkVersion(version: string) {
	if (Number.parseInt(version, 10) < MIN_SERVER_MAJOR) {
		throw new Error(
			`This server runs GameVault ${version}. Stault needs ${MIN_SERVER_MAJOR}.0 or newer.`,
		);
	}
}

/** How Stault can sign in to a server. */
async function signInMethods(serverUrl: string, status: ApiStatus): Promise<SignInMethod[]> {
	const offered = status.available_authentication_methods ?? [];
	const password = offered.includes("basic");
	// This includes a server that names no method: its answer to a password says what's wrong.
	if (!offered.includes("sso")) return ["basic"];
	if (await GameVaultClient.ssoReturnsToApps(serverUrl)) return password ? ["basic", "sso"] : ["sso"];
	if (password) return ["basic"];
	throw new Error(
		"This server signs in only through single sign-on, and doesn't hand that back to apps. It needs GameVault 17.3 or newer, with AUTH_OAUTH2_LOOPBACK_RETURN_ENABLED left on.",
	);
}

export interface SessionHooks {
	/** A session exists (restored or just signed in). */
	signedIn(serverUrl: string): void;
	/** The session is about to be dropped. */
	signingOut(): Promise<void>;
	/** Opens a web page in the system browser. False when there is no browser to open it. */
	openBrowser(url: string): boolean;
}

export class Session {
	private current: GameVaultClient | null = null;
	/** The single sign-on waiting on the browser, if any. */
	private sso: AbortController | null = null;

	constructor(
		private readonly settings: SettingsFile,
		private readonly secrets: SecretStore,
		private readonly media: MediaProxy,
		private readonly library: Library,
		private readonly hooks: SessionHooks,
	) {}

	get serverUrl(): string {
		return this.client.serverUrl;
	}

	/** The signed-in client. Throws when nobody is signed in. */
	get client(): GameVaultClient {
		if (!this.current) throw new SignedOutError();
		return this.current;
	}

	get userId(): number {
		const account = this.settings.get().account;
		if (!account) throw new SignedOutError();
		return account.userId;
	}

	private connect(serverUrl: string, username: string, refreshToken: string | null) {
		const secretName = `${serverUrl}#${username}`;
		this.current = new GameVaultClient(serverUrl, refreshToken, {
			onTokens: (tokens) => this.secrets.set(secretName, tokens.refresh_token),
			onOnline: (online) => {
				if (getState().online !== online) patchState({ online });
			},
		});
		this.media.use(this.current);
		return this.current;
	}

	async check(url: string): Promise<ServerCheck> {
		try {
			const { serverUrl, status } = await findServer(url);
			checkVersion(status.version);
			return { ok: true, serverUrl, version: status.version, methods: await signInMethods(serverUrl, status) };
		} catch (error) {
			return { ok: false, error: (error as Error).message };
		}
	}

	/** Picks up where the last run left off. Works without a connection. */
	async restore() {
		const { account } = this.settings.get();
		const token = account && (await this.secrets.get(`${account.serverUrl}#${account.username}`));
		if (!account || !token) {
			patchState({ ready: true });
			return;
		}
		this.connect(account.serverUrl, account.username, token);
		this.library.loadCache();
		patchState({ ready: true, session: account });
		this.hooks.signedIn(account.serverUrl);
		await this.refreshLibrary();
	}

	/** Reloads the library. A dead session signs out; being offline is not an error here. */
	async refreshLibrary() {
		try {
			await this.library.refresh(this.client);
		} catch (error) {
			if (error instanceof SignedOutError) return this.forget();
			if (!getState().online) return;
			throw error;
		}
		// Not awaited: it can take a request per game, which sign-in shouldn't wait for.
		void this.library.fillVersions(this.client);
	}

	async signIn(input: {
		serverUrl: string;
		username: string;
		password: string;
	}) {
		const username = input.username.trim();
		if (!username || !input.password) throw new Error("Enter your username and password.");
		await this.start(input.serverUrl, (client) => client.login(username, input.password));
	}

	/**
	 * Signs in through the server's identity provider, in the system browser.
	 * False when the sign-in was called off (`cancelSso`).
	 */
	async signInWithSso(input: { serverUrl: string }): Promise<boolean> {
		this.cancelSso();
		const pending = new AbortController();
		this.sso = pending;
		try {
			await this.start(input.serverUrl, async (client, status) => {
				if (!(await signInMethods(client.serverUrl, status)).includes("sso")) {
					throw new Error("This server doesn't offer single sign-on to Stault.");
				}
				return browserSignIn(
					client.serverUrl,
					this.hooks.openBrowser,
					(code, verifier) => client.redeemLoginCode(code, verifier),
					pending.signal,
				);
			});
			return true;
		} catch (error) {
			if (pending.signal.aborted) return false;
			throw error;
		} finally {
			if (this.sso === pending) this.sso = null;
		}
	}

	/** Stops waiting for the browser. */
	cancelSso() {
		this.sso?.abort();
	}

	/** Signs in to the server at `url`. `authenticate` gets the first tokens for the client it is handed. */
	private async start(
		url: string,
		authenticate: (client: GameVaultClient, status: ApiStatus) => Promise<void>,
	) {
		const { serverUrl, status } = await findServer(url);
		checkVersion(status.version);

		// The refresh token is stored under the account's name, which only the
		// server knows for sure. So the first tokens go to a client of their own.
		const issued: ApiTokens[] = [];
		const guest = new GameVaultClient(serverUrl, null, {
			onTokens: (tokens) => void issued.push(tokens),
		});
		await authenticate(guest, status);
		const me = await guest.me();

		const client = this.connect(serverUrl, me.username, null);
		try {
			await client.adopt(issued.at(-1)!);
			const account = {
				serverUrl,
				serverVersion: status.version,
				userId: Number(me.id),
				username: me.username,
			};
			const lastSignIn = { serverUrl, username: me.username };
			this.settings.update({ account, lastSignIn });
			patchState({ session: account, lastSignIn, online: true });
			this.hooks.signedIn(serverUrl);
		} catch (error) {
			this.current = null;
			this.media.use(null);
			throw error;
		}
		await this.refreshLibrary();
	}

	async signOut() {
		await this.current?.revoke();
		await this.forget();
	}

	/** Drops the local session without talking to the server. */
	private async forget() {
		await this.hooks.signingOut();
		const { account } = this.settings.get();
		if (account) await this.secrets.delete(`${account.serverUrl}#${account.username}`);
		this.settings.update({ account: null });
		this.current = null;
		this.media.use(null);
		this.library.clear();
		patchState({ session: null });
	}
}
