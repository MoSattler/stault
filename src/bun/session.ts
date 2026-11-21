import {
	GameVaultClient,
	normalizeServerUrl,
	SignedOutError,
} from "./gamevault/client";
import type { Library } from "./library";
import type { MediaProxy } from "./media";
import type { SecretStore } from "./secrets";
import type { SettingsFile } from "./settings";
import { getState, patchState } from "./state";
import type { ServerCheck } from "../shared/model";

/** Oldest server whose API Stault is written against (versions, save files). */
const MIN_SERVER_MAJOR = 17;

function checkVersion(version: string) {
	if (Number.parseInt(version, 10) < MIN_SERVER_MAJOR) {
		throw new Error(
			`This server runs GameVault ${version}. Stault needs ${MIN_SERVER_MAJOR}.0 or newer.`,
		);
	}
}

export class Session {
	private current: GameVaultClient | null = null;

	constructor(
		private readonly settings: SettingsFile,
		private readonly secrets: SecretStore,
		private readonly media: MediaProxy,
		private readonly library: Library,
	) {}

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
			const status = await GameVaultClient.status(normalizeServerUrl(url));
			checkVersion(status.version);
			return { ok: true, version: status.version };
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
		await this.refreshLibrary();
	}

	/** Reloads the library. A dead session signs out; being offline is not an error here. */
	async refreshLibrary() {
		try {
			await this.library.refresh(this.client);
		} catch (error) {
			if (error instanceof SignedOutError) await this.forget();
			else if (!getState().online) return;
			else throw error;
		}
	}

	async signIn(input: {
		serverUrl: string;
		username: string;
		password: string;
		deviceName: string;
	}) {
		const serverUrl = normalizeServerUrl(input.serverUrl);
		const username = input.username.trim();
		if (!username || !input.password) throw new Error("Enter your username and password.");
		const status = await GameVaultClient.status(serverUrl);
		checkVersion(status.version);

		const client = this.connect(serverUrl, username, null);
		try {
			await client.login(username, input.password);
			const me = await client.me();
			const account = {
				serverUrl,
				serverVersion: status.version,
				userId: Number(me.id),
				username: me.username,
			};
			const deviceName = input.deviceName.trim() || getState().deviceName;
			this.settings.update({ account, deviceName });
			patchState({ session: account, deviceName, online: true });
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
		const { account } = this.settings.get();
		if (account) await this.secrets.delete(`${account.serverUrl}#${account.username}`);
		this.settings.update({ account: null });
		this.current = null;
		this.media.use(null);
		this.library.clear();
		patchState({ session: null });
	}
}
